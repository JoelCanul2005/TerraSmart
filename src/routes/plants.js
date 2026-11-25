import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { plantInclude, serializePlant } from '../lib/serialize.js';
import { moistureSeries } from '../lib/stats.js';
import { imageUrlSchema } from '../lib/validation.js';
import { avg, daysAgo, hoursAgo } from '../lib/utils.js';
import { waterPlant } from '../lib/watering.js';
import { asyncHandler, badRequest, notFound } from '../utils/http.js';

const router = Router();
router.use(requireAuth);

const plantSchema = z.object({
  name: z.string().trim().min(1, 'Ponle un nombre'),
  species: z.string().trim().min(1, 'Escribe la especie'),
  location: z.string().trim().min(1, 'Indica la ubicación'),
  zoneId: z.string().nullish(),
  deviceId: z.string().nullish(),
  notes: z.string().trim().max(500).nullish(),
  imageUrl: imageUrlSchema,
  moistureMin: z.coerce.number().int().min(0).max(100).default(30),
  moistureMax: z.coerce.number().int().min(0).max(100).default(70),
  wateringEveryDays: z.coerce.number().int().min(1).max(30).default(3),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const plants = await prisma.plant.findMany({
      where: { userId: req.userId },
      include: plantInclude,
      orderBy: { createdAt: 'asc' },
    });
    res.json({ plants: plants.map(serializePlant) });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = plantSchema.parse(req.body);
    if (data.moistureMin >= data.moistureMax) throw badRequest('El mínimo debe ser menor que el máximo');

    const plant = await prisma.plant.create({
      data: {
        userId: req.userId,
        name: data.name,
        species: data.species,
        location: data.location,
        zoneId: data.zoneId || null,
        deviceId: data.deviceId || null,
        notes: data.notes ?? null,
        imageUrl: data.imageUrl ?? null,
        moistureMin: data.moistureMin,
        moistureMax: data.moistureMax,
        wateringEveryDays: data.wateringEveryDays,
      },
      include: plantInclude,
    });

    // lectura inicial estimada para que la planta aparezca con datos
    await prisma.reading.create({
      data: {
        plantId: plant.id,
        deviceId: plant.deviceId,
        moisture: Math.round((data.moistureMin + data.moistureMax) / 2),
        temperature: 24,
      },
    });

    const fresh = await prisma.plant.findUnique({ where: { id: plant.id }, include: plantInclude });
    res.status(201).json({ plant: serializePlant(fresh) });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const days = req.user.plan === 'PREMIUM' ? 7 : Math.min(7, config.freeHistoryDays);
    const plant = await prisma.plant.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: {
        ...plantInclude,
        fertilizations: { orderBy: { scheduledAt: 'asc' } },
        waterings: { orderBy: { startedAt: 'desc' }, take: 5 },
      },
    });
    if (!plant) throw notFound('Planta no encontrada');

    const series = await prisma.reading.findMany({
      where: { plantId: plant.id, recordedAt: { gte: daysAgo(days) } },
      select: { moisture: true, recordedAt: true, temperature: true },
      orderBy: { recordedAt: 'asc' },
    });

    const byDay = new Map();
    for (const r of series) {
      const key = r.recordedAt.toISOString().slice(0, 10);
      const item = byDay.get(key) ?? { sum: 0, n: 0, temp: 0, tempN: 0 };
      item.sum += r.moisture;
      item.n += 1;
      if (r.temperature != null) {
        item.temp += r.temperature;
        item.tempN += 1;
      }
      byDay.set(key, item);
    }

    const daily = [...byDay.entries()].map(([date, v]) => ({
      date,
      moisture: Math.round(v.sum / v.n),
      temperature: v.tempN ? Math.round((v.temp / v.tempN) * 10) / 10 : null,
    }));

    res.json({
      plant: serializePlant(plant),
      daily,
      historyLimitDays: days,
      fertilizations: plant.fertilizations,
      waterings: plant.waterings,
      stats: {
        average: daily.length ? Math.round(avg(daily.map((d) => d.moisture))) : null,
        min: daily.length ? Math.min(...daily.map((d) => d.moisture)) : null,
        max: daily.length ? Math.max(...daily.map((d) => d.moisture)) : null,
      },
    });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = plantSchema.partial().parse(req.body);
    const exists = await prisma.plant.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!exists) throw notFound('Planta no encontrada');

    const plant = await prisma.plant.update({
      where: { id: req.params.id },
      data: {
        ...data,
        zoneId: data.zoneId === undefined ? undefined : data.zoneId || null,
        deviceId: data.deviceId === undefined ? undefined : data.deviceId || null,
      },
      include: plantInclude,
    });
    res.json({ plant: serializePlant(plant) });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const exists = await prisma.plant.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!exists) throw notFound('Planta no encontrada');
    await prisma.plant.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);

router.get(
  '/:id/readings',
  asyncHandler(async (req, res) => {
    const hours = Math.min(Number(req.query.hours ?? 24), 24 * 30);
    const plant = await prisma.plant.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!plant) throw notFound('Planta no encontrada');

    const readings = await prisma.reading.findMany({
      where: { plantId: plant.id, recordedAt: { gte: hoursAgo(hours) } },
      orderBy: { recordedAt: 'asc' },
      take: 500,
    });
    res.json({ readings });
  }),
);

router.post(
  '/:id/water',
  asyncHandler(async (req, res) => {
    const data = z
      .object({ minutes: z.coerce.number().int().min(1).max(60).default(5) })
      .parse(req.body ?? {});

    const result = await waterPlant({
      userId: req.userId,
      plantId: req.params.id,
      minutes: data.minutes,
      source: 'MANUAL',
    });

    const plant = await prisma.plant.findUnique({ where: { id: req.params.id }, include: plantInclude });
    res.status(201).json({
      liters: result.liters,
      moisture: result.moisture,
      plant: serializePlant(plant),
    });
  }),
);

export default router;
