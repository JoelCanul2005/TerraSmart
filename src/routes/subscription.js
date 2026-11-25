import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { publicUser, requireAuth, requirePremium } from '../middleware/auth.js';
import { asyncHandler, badRequest } from '../utils/http.js';

const router = Router();
router.use(requireAuth);

const PREMIUM_FEATURES = [
  'Riego automático y por zonas',
  'Consumo de agua detallado',
  'Automatizaciones y reglas',
  'Modo vacaciones',
  'Asistente con IA',
  'Reportes mensuales con IA',
  'Historial completo de mediciones',
];

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [plants, devices, waterings] = await Promise.all([
      prisma.plant.count({ where: { userId: req.userId } }),
      prisma.device.count({ where: { userId: req.userId } }),
      prisma.wateringEvent.count({ where: { userId: req.userId } }),
    ]);

    res.json({
      plan: req.user.plan,
      price: config.premiumPrice,
      renewsAt: req.user.planRenewsAt,
      features: PREMIUM_FEATURES,
      usage: { plants, devices, waterings },
    });
  }),
);

router.post(
  '/cancel',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { plan: 'BASIC', planRenewsAt: null, vacationMode: false, vacationFrom: null, vacationTo: null },
    });
    res.json({ user: publicUser(user), message: 'Suscripción cancelada. Conservas las funciones básicas.' });
  }),
);

router.post(
  '/vacation',
  requirePremium,
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        active: z.coerce.boolean(),
        from: z.coerce.date().nullish(),
        to: z.coerce.date().nullish(),
      })
      .parse(req.body);

    if (data.active && (!data.from || !data.to)) throw badRequest('Indica las fechas de inicio y fin');
    if (data.active && data.to < data.from) throw badRequest('La fecha final debe ser posterior a la inicial');

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        vacationMode: data.active,
        vacationFrom: data.active ? data.from : null,
        vacationTo: data.active ? data.to : null,
      },
    });

    res.json({
      user: publicUser(user),
      message: data.active ? 'Modo vacaciones activado' : 'Modo vacaciones desactivado',
    });
  }),
);

export default router;
