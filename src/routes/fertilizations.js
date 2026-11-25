import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, notFound } from '../utils/http.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tasks = await prisma.fertilizationTask.findMany({
      where: { plant: { userId: req.userId } },
      include: { plant: { select: { id: true, name: true, species: true } } },
      orderBy: [{ doneAt: 'asc' }, { scheduledAt: 'asc' }],
    });

    res.json({
      pending: tasks.filter((t) => !t.doneAt).map((t) => ({ ...t, late: t.scheduledAt < new Date() })),
      done: tasks.filter((t) => t.doneAt).slice(0, 10),
    });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        plantId: z.string().min(1),
        product: z.string().trim().min(1, 'Escribe el producto'),
        dose: z.string().trim().max(60).optional(),
        scheduledAt: z.coerce.date(),
        notes: z.string().trim().max(300).optional(),
      })
      .parse(req.body);

    const plant = await prisma.plant.findFirst({ where: { id: data.plantId, userId: req.userId } });
    if (!plant) throw notFound('Planta no encontrada');

    const task = await prisma.fertilizationTask.create({
      data: { ...data, plantId: plant.id },
      include: { plant: { select: { id: true, name: true, species: true } } },
    });
    res.status(201).json({ task });
  }),
);

router.patch(
  '/:id/done',
  asyncHandler(async (req, res) => {
    const task = await prisma.fertilizationTask.findFirst({
      where: { id: req.params.id, plant: { userId: req.userId } },
    });
    if (!task) throw notFound('Tarea no encontrada');

    const updated = await prisma.fertilizationTask.update({
      where: { id: task.id },
      data: { doneAt: new Date() },
      include: { plant: { select: { id: true, name: true, species: true } } },
    });
    res.json({ task: updated });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const task = await prisma.fertilizationTask.findFirst({
      where: { id: req.params.id, plant: { userId: req.userId } },
    });
    if (!task) throw notFound('Tarea no encontrada');
    await prisma.fertilizationTask.delete({ where: { id: task.id } });
    res.status(204).end();
  }),
);

export default router;
