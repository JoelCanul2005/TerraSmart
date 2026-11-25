import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { refreshAlerts } from '../lib/alerts.js';
import { getOverview, moistureSeries } from '../lib/stats.js';
import { serializeDevice, serializePlant } from '../lib/serialize.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await refreshAlerts(req.userId);

    const [overview, series, alerts, devices] = await Promise.all([
      getOverview(req.userId),
      moistureSeries(req.userId, 24),
      prisma.alert.findMany({
        where: { userId: req.userId },
        orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
        take: 4,
      }),
      prisma.device.findMany({ where: { userId: req.userId }, orderBy: { code: 'asc' } }),
    ]);

    const plants = overview.plants
      .map(serializePlant)
      .sort((a, b) => (a.moisture ?? 101) - (b.moisture ?? 101));

    res.json({
      plan: req.user.plan,
      averageMoisture: overview.averageMoisture,
      needsWater: overview.needsWater,
      unreadAlerts: overview.unreadAlerts,
      weekLiters: overview.weekLiters,
      plantCount: overview.plants.length,
      series,
      plants,
      alerts,
      devices: devices.map(serializeDevice),
      tasks: overview.upcoming.map((t) => ({
        id: t.id,
        product: t.product,
        dose: t.dose,
        scheduledAt: t.scheduledAt,
        plant: t.plant,
      })),
      vacation: {
        active: req.user.vacationMode,
        from: req.user.vacationFrom,
        to: req.user.vacationTo,
      },
    });
  }),
);

export default router;
