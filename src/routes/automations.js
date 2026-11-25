import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requirePremium } from '../middleware/auth.js';
import { waterPlant, waterZone } from '../lib/watering.js';
import { asyncHandler, badRequest, notFound } from '../utils/http.js';

const router = Router();
router.use(requireAuth, requirePremium);

const ruleSchema = z.object({
  name: z.string().trim().min(1, 'Ponle un nombre'),
  trigger: z.enum(['MOISTURE_BELOW', 'SCHEDULE']).default('MOISTURE_BELOW'),
  threshold: z.coerce.number().int().min(0).max(100).nullish(),
  minutes: z.coerce.number().int().min(1).max(30).default(5),
  hour: z.coerce.number().int().min(0).max(23).nullish(),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).default([]),
  plantId: z.string().nullish(),
  zoneId: z.string().nullish(),
  enabled: z.coerce.boolean().default(true),
});

const withRelations = {
  plant: { select: { id: true, name: true } },
  zone: { select: { id: true, name: true, color: true } },
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rules = await prisma.automationRule.findMany({
      where: { userId: req.userId },
      include: withRelations,
      orderBy: { createdAt: 'asc' },
    });
    res.json({ rules });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = ruleSchema.parse(req.body);
    if (data.trigger === 'MOISTURE_BELOW' && data.threshold == null) {
      throw badRequest('Indica el umbral de humedad');
    }
    if (data.trigger === 'SCHEDULE' && data.hour == null) {
      throw badRequest('Indica la hora del riego');
    }
    if (!data.plantId && !data.zoneId) throw badRequest('Selecciona una planta o una zona');

    const rule = await prisma.automationRule.create({
      data: {
        ...data,
        threshold: data.threshold ?? null,
        hour: data.hour ?? null,
        userId: req.userId,
        plantId: data.plantId || null,
        zoneId: data.zoneId || null,
      },
      include: withRelations,
    });
    res.status(201).json({ rule });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = ruleSchema.partial().parse(req.body);
    const existing = await prisma.automationRule.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) throw notFound('Automatización no encontrada');

    const rule = await prisma.automationRule.update({
      where: { id: existing.id },
      data: {
        ...data,
        plantId: data.plantId === undefined ? undefined : data.plantId || null,
        zoneId: data.zoneId === undefined ? undefined : data.zoneId || null,
      },
      include: withRelations,
    });
    res.json({ rule });
  }),
);

router.post(
  '/:id/toggle',
  asyncHandler(async (req, res) => {
    const existing = await prisma.automationRule.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) throw notFound('Automatización no encontrada');

    const rule = await prisma.automationRule.update({
      where: { id: existing.id },
      data: { enabled: !existing.enabled },
      include: withRelations,
    });
    res.json({ rule });
  }),
);

/** Ejecuta la regla ahora (simula el disparo del controlador). */
router.post(
  '/:id/run',
  asyncHandler(async (req, res) => {
    const rule = await prisma.automationRule.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!rule) throw notFound('Automatización no encontrada');

    const payload = { minutes: rule.minutes };
    const result = rule.zoneId
      ? await waterZone({ userId: req.userId, zoneId: rule.zoneId, minutes: payload.minutes, source: 'AUTOMATIC' })
      : await waterPlant({ userId: req.userId, plantId: rule.plantId, minutes: payload.minutes, source: 'AUTOMATIC' });

    await prisma.automationRule.update({ where: { id: rule.id }, data: { lastRunAt: new Date() } });
    res.status(201).json({ result, minutes: rule.minutes });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.automationRule.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) throw notFound('Automatización no encontrada');
    await prisma.automationRule.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

export default router;
