import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requirePremium } from '../middleware/auth.js';
import { assistantReply, generateReport } from '../lib/ai.js';
import { asyncHandler, notFound } from '../utils/http.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/chat',
  asyncHandler(async (req, res) => {
    const messages = await prisma.chatMessage.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'asc' },
      take: 40,
    });
    res.json({ messages, premium: req.user.plan === 'PREMIUM' });
  }),
);

router.post(
  '/chat',
  requirePremium,
  asyncHandler(async (req, res) => {
    const { message } = z.object({ message: z.string().trim().min(1).max(500) }).parse(req.body);

    const userMessage = await prisma.chatMessage.create({
      data: { userId: req.userId, role: 'USER', content: message },
    });

    const reply = await assistantReply(req.userId, message);
    const assistantMessage = await prisma.chatMessage.create({
      data: { userId: req.userId, role: 'ASSISTANT', content: reply },
    });

    res.status(201).json({ messages: [userMessage, assistantMessage] });
  }),
);

router.delete(
  '/chat',
  asyncHandler(async (req, res) => {
    await prisma.chatMessage.deleteMany({ where: { userId: req.userId } });
    res.status(204).end();
  }),
);

router.get(
  '/reports',
  requirePremium,
  asyncHandler(async (req, res) => {
    const reports = await prisma.aiReport.findMany({
      where: { userId: req.userId },
      orderBy: { generatedAt: 'desc' },
      take: 12,
    });
    res.json({ reports });
  }),
);

router.post(
  '/reports',
  requirePremium,
  asyncHandler(async (req, res) => {
    const report = await generateReport(req.userId);
    res.status(201).json({ report });
  }),
);

router.get(
  '/reports/:id',
  requirePremium,
  asyncHandler(async (req, res) => {
    const report = await prisma.aiReport.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!report) throw notFound('Reporte no encontrado');
    res.json({ report });
  }),
);

export default router;
