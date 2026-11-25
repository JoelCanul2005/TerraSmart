import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { serializeDevice } from '../lib/serialize.js';
import { asyncHandler, notFound, unauthorized } from '../utils/http.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const devices = await prisma.device.findMany({
      where: { userId: req.userId },
      include: {
        plants: { select: { id: true, name: true } },
        readings: { take: 1, orderBy: { recordedAt: 'desc' } },
      },
      orderBy: { code: 'asc' },
    });

    res.json({
      devices: devices.map((d) => ({
        ...serializeDevice(d),
        plants: d.plants,
        lastReading: d.readings[0]
          ? { moisture: d.readings[0].moisture, temperature: d.readings[0].temperature, recordedAt: d.readings[0].recordedAt }
          : null,
      })),
    });
  }),
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = z.object({ name: z.string().trim().min(1, 'Ponle un nombre') }).parse(req.body);
    const device = await prisma.device.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!device) throw notFound('Dispositivo no encontrado');

    const updated = await prisma.device.update({ where: { id: device.id }, data });
    res.json({ device: serializeDevice(updated) });
  }),
);

/**
 * Ingesta de lecturas desde el hardware / simulador.
 * No usa JWT: se autentica con la llave del dispositivo (header x-device-key).
 */
router.post(
  '/:code/readings',
  asyncHandler(async (req, res) => {
    if (req.headers['x-device-key'] !== config.deviceKey) throw unauthorized('Llave de dispositivo inválida');

    const data = z
      .object({
        moisture: z.coerce.number().int().min(0).max(100),
        temperature: z.coerce.number().min(-10).max(60).optional(),
        battery: z.coerce.number().int().min(0).max(100).optional(),
      })
      .parse(req.body);

    const device = await prisma.device.findUnique({
      where: { code: req.params.code.toUpperCase() },
      include: { plants: { select: { id: true } } },
    });
    if (!device) throw notFound('Dispositivo no registrado');

    await prisma.device.update({
      where: { id: device.id },
      data: {
        status: 'ONLINE',
        lastSeenAt: new Date(),
        battery: data.battery ?? device.battery,
      },
    });

    if (device.plants.length) {
      await prisma.reading.createMany({
        data: device.plants.map((plant) => ({
          plantId: plant.id,
          deviceId: device.id,
          moisture: data.moisture,
          temperature: data.temperature,
          battery: data.battery,
        })),
      });
    }

    res.status(201).json({ ok: true, plants: device.plants.length });
  }),
);

export default router;
