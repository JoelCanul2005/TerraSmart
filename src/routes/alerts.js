import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { refreshAlerts } from '../lib/alerts.js';
import { asyncHandler, notFound } from '../utils/http.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await refreshAlerts(req.userId);

    const [alerts, unread] = await Promise.all([
      prisma.alert.findMany({
        where: { userId: req.userId },
        include: { plant: { select: { id: true, name: true } } },
        orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
        take: 60,
      }),
      prisma.alert.count({ where: { userId: req.userId, read: false } }),
    ]);

    res.json({ alerts, unread });
  }),
);

router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const alert = await prisma.alert.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!alert) throw notFound('Alerta no encontrada');
    const updated = await prisma.alert.update({ where: { id: alert.id }, data: { read: true } });
    res.json({ alert: updated });
  }),
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const result = await prisma.alert.updateMany({
      where: { userId: req.userId, read: false },
      data: { read: true },
    });
    res.json({ updated: result.count });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const alert = await prisma.alert.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!alert) throw notFound('Alerta no encontrada');
    await prisma.alert.delete({ where: { id: alert.id } });
    res.status(204).end();
  }),
);

export default router;
