import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requirePremium } from '../middleware/auth.js';
import { getConsumption } from '../lib/stats.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();
router.use(requireAuth, requirePremium);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const days = Math.max(7, Math.min(Number(req.query.days ?? 14), 90));
    const [data, lastEvents] = await Promise.all([
      getConsumption(req.userId, days),
      prisma.wateringEvent.findMany({
        where: { userId: req.userId },
        include: { plant: { select: { name: true } }, zone: { select: { name: true } } },
        orderBy: { startedAt: 'desc' },
        take: 12,
      }),
    ]);

    res.json({ ...data, lastEvents });
  }),
);

export default router;
