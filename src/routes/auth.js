import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { publicUser, requireAuth, signToken } from '../middleware/auth.js';
import { asyncHandler, badRequest, unauthorized } from '../utils/http.js';

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Escribe tu nombre'),
  email: z.string().trim().email('Correo inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
});

const loginSchema = z.object({
  email: z.string().trim().email('Correo inválido'),
  password: z.string().min(1, 'Escribe tu contraseña'),
});

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const email = data.email.toLowerCase();

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw badRequest('Ya existe una cuenta con ese correo');

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email,
        passwordHash: await bcrypt.hash(data.password, 10),
        zones: { create: [{ name: 'Mi hogar', color: '#2E8B5F', icon: 'home' }] },
      },
    });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  }),
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (!user) throw unauthorized('Correo o contraseña incorrectos');

    const ok = await bcrypt.compare(data.password, user.passwordHash);
    if (!ok) throw unauthorized('Correo o contraseña incorrectos');

    res.json({ token: signToken(user), user: publicUser(user) });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [plants, devices, unread] = await Promise.all([
      prisma.plant.count({ where: { userId: req.userId } }),
      prisma.device.count({ where: { userId: req.userId } }),
      prisma.alert.count({ where: { userId: req.userId, read: false } }),
    ]);
    res.json({ user: publicUser(req.user), counts: { plants, devices, unreadAlerts: unread } });
  }),
);

router.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = z
      .object({ name: z.string().trim().min(2).optional() })
      .parse(req.body);
    const user = await prisma.user.update({ where: { id: req.userId }, data });
    res.json({ user: publicUser(user) });
  }),
);

router.post(
  '/me/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(6, 'Mínimo 6 caracteres'),
      })
      .parse(req.body);

    const ok = await bcrypt.compare(data.currentPassword, req.user.passwordHash);
    if (!ok) throw badRequest('La contraseña actual no coincide');

    await prisma.user.update({
      where: { id: req.userId },
      data: { passwordHash: await bcrypt.hash(data.newPassword, 10) },
    });
    res.json({ ok: true });
  }),
);

export default router;
