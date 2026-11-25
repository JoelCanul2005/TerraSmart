import { Router } from 'express';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { moistureSeries } from '../lib/stats.js';
import { daysAgo } from '../lib/utils.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();
router.use(requireAuth);

/**
 * Historial de mediciones.
 * Plan Básico: últimos 7 días. Plan Premium: historial completo.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const requested = Number(req.query.days ?? config.freeHistoryDays);
    const limit = req.user.plan === 'PREMIUM' ? config.premiumHistoryDays : config.freeHistoryDays;
    const days = Math.max(1, Math.min(requested, limit));
    const limited = req.user.plan !== 'PREMIUM' && requested > config.freeHistoryDays;

    const from = daysAgo(days);
    const [series, recent, readings, waterings] = await Promise.all([
      moistureSeries(req.userId, days * 24),
      prisma.reading.findMany({
        where: { plant: { userId: req.userId }, recordedAt: { gte: from } },
        include: { plant: { select: { name: true } } },
        orderBy: { recordedAt: 'desc' },
        take: 40,
      }),
      prisma.reading.findMany({
        where: { plant: { userId: req.userId }, recordedAt: { gte: from } },
        select: { moisture: true },
      }),
      prisma.wateringEvent.findMany({
        where: { userId: req.userId, startedAt: { gte: from } },
        include: { plant: { select: { name: true } }, zone: { select: { name: true } } },
        orderBy: { startedAt: 'desc' },
        take: 15,
      }),
    ]);

    const values = readings.map((r) => r.moisture);

    res.json({
      days,
      limit,
      limited,
      plan: req.user.plan,
      points: series,
      stats: {
        count: values.length,
        average: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null,
        min: values.length ? Math.min(...values) : null,
        max: values.length ? Math.max(...values) : null,
      },
      recent: recent.map((r) => ({
        id: r.id,
        moisture: r.moisture,
        temperature: r.temperature,
        recordedAt: r.recordedAt,
        plant: r.plant.name,
      })),
      waterings,
    });
  }),
);

export default router;
