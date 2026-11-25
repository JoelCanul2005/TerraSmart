import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requirePremium } from '../middleware/auth.js';
import { waterZone } from '../lib/watering.js';
import { asyncHandler, notFound } from '../utils/http.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const zones = await prisma.zone.findMany({
      where: { userId: req.userId },
      include: {
        plants: {
          include: { readings: { take: 1, orderBy: { recordedAt: 'desc' } } },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      zones: zones.map((zone) => {
        const moistures = zone.plants.map((p) => p.readings[0]?.moisture).filter((m) => typeof m === 'number');
        return {
          id: zone.id,
          name: zone.name,
          color: zone.color,
          icon: zone.icon,
          plantCount: zone.plants.length,
          averageMoisture: moistures.length ? Math.round(moistures.reduce((a, b) => a + b, 0) / moistures.length) : null,
          plants: zone.plants.map((p) => ({
            id: p.id,
            name: p.name,
            moisture: p.readings[0]?.moisture ?? null,
            moistureMin: p.moistureMin,
          })),
        };
      }),
    });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        name: z.string().trim().min(1, 'Ponle un nombre'),
        color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default('#2E8B5F'),
        icon: z.string().trim().default('home'),
      })
      .parse(req.body);

    const zone = await prisma.zone.create({ data: { ...data, userId: req.userId } });
    res.status(201).json({ zone });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        name: z.string().trim().min(1).optional(),
        color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        icon: z.string().trim().optional(),
      })
      .parse(req.body);

    const zone = await prisma.zone.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!zone) throw notFound('Zona no encontrada');

    const updated = await prisma.zone.update({ where: { id: zone.id }, data });
    res.json({ zone: updated });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const zone = await prisma.zone.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!zone) throw notFound('Zona no encontrada');
    await prisma.zone.delete({ where: { id: zone.id } });
    res.status(204).end();
  }),
);

// Riego por grupos (Premium)
router.post(
  '/:id/water',
  requirePremium,
  asyncHandler(async (req, res) => {
    const data = z
      .object({ minutes: z.coerce.number().int().min(1).max(30).default(5) })
      .parse(req.body ?? {});

    const result = await waterZone({
      userId: req.userId,
      zoneId: req.params.id,
      minutes: data.minutes,
    });
    res.status(201).json(result);
  }),
);

export default router;
