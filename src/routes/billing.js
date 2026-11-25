/**
 * Pasarela de pago TerraPay.
 *
 * Flujo de cobro de la suscripción Premium. Nunca se guardan datos sensibles:
 * únicamente marca, últimos 4 dígitos y el nombre del titular.
 *
 * Las credenciales de la tarjeta aprobada y el resto de detalles de
 * integración se documentan en README.md, no se exponen en la interfaz.
 */
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { publicUser, requireAuth } from '../middleware/auth.js';
import { ApiError, asyncHandler, badRequest } from '../utils/http.js';

const router = Router();
router.use(requireAuth);

export const GATEWAY_NAME = 'TerraPay';
export const APPROVED_CARD = '4242424242424242';
const onlyDigits = (value) => String(value ?? '').replace(/\D/g, '');

export function luhnValid(digits) {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function brandOf(digits) {
  if (/^4/.test(digits)) return 'Visa';
  if (/^5[1-5]/.test(digits) || /^2(2[2-9]|[3-6]\d|7[01]|720)/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'American Express';
  if (/^3(0[0-5]|[68])/.test(digits)) return 'Diners Club';
  if (/^6(011|5)/.test(digits)) return 'Discover';
  return 'Tarjeta';
}

function parseExpiry(value) {
  const match = /^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/.exec(String(value ?? '').trim());
  if (!match) throw badRequest('El vencimiento debe tener formato MM/AA');

  const month = Number(match[1]);
  let year = Number(match[2]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12) throw badRequest('Mes de vencimiento inválido');

  // El primer día del mes siguiente marca el fin de la validez.
  const validUntil = new Date(year, month, 1);
  if (validUntil <= new Date()) {
    throw new ApiError(400, 'La tarjeta está vencida', { code: 'CARD_EXPIRED' });
  }
  return { month, year };
}

export const serializePayment = (payment) => ({
  id: payment.id,
  reference: payment.reference,
  gateway: payment.gateway,
  amount: payment.amount,
  currency: payment.currency,
  status: payment.status,
  brand: payment.brand,
  last4: payment.last4,
  holder: payment.holder,
  periodStart: payment.periodStart,
  periodEnd: payment.periodEnd,
  createdAt: payment.createdAt,
});

const newReference = () => `TP-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;

router.get('/config', (req, res) => {
  res.json({
    gateway: GATEWAY_NAME,
    currency: 'MXN',
    price: config.premiumPrice,
    plan: req.user.plan,
  });
});

router.get(
  '/payments',
  asyncHandler(async (req, res) => {
    const payments = await prisma.payment.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
    res.json({ payments: payments.map(serializePayment) });
  }),
);

router.post(
  '/checkout',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        number: z.string().trim().min(12, 'Número de tarjeta incompleto').max(25),
        holder: z.string().trim().min(3, 'Escribe el nombre del titular').max(60),
        expiry: z.string().trim().min(4, 'Indica el vencimiento').max(7),
        cvc: z.string().trim().regex(/^\d{3,4}$/, 'El CVC debe tener 3 o 4 dígitos'),
      })
      .parse(req.body);

    const digits = onlyDigits(body.number);
    if (!/^\d{13,19}$/.test(digits)) {
      throw new ApiError(400, 'Número de tarjeta inválido', { code: 'INVALID_CARD' });
    }
    if (!luhnValid(digits)) {
      throw new ApiError(400, 'El número de tarjeta no pasa la validación de Luhn', { code: 'INVALID_CARD' });
    }

    parseExpiry(body.expiry);

    if (req.user.plan === 'PREMIUM') throw badRequest('Ya tienes el plan Premium activo');

    const brand = brandOf(digits);
    const last4 = digits.slice(-4);
    const shared = {
      amount: config.premiumPrice,
      currency: 'MXN',
      brand,
      last4,
      holder: body.holder,
      userId: req.userId,
    };

    if (digits !== APPROVED_CARD) {
      // Se registra el intento rechazado para mostrarlo en el historial.
      await prisma.payment.create({
        data: {
          ...shared,
          reference: newReference(),
          gateway: GATEWAY_NAME,
          status: 'DECLINED',
          periodEnd: new Date(),
        },
      });

      throw new ApiError(
        402,
        'Pago rechazado por el banco emisor. Revisa los datos de tu tarjeta e inténtalo de nuevo.',
        { code: 'CARD_DECLINED' },
      );
    }

    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 30);

    const [payment, user] = await prisma.$transaction([
      prisma.payment.create({
        data: {
          ...shared,
          reference: newReference(),
          gateway: GATEWAY_NAME,
          status: 'PAID',
          periodStart,
          periodEnd,
        },
      }),
      prisma.user.update({
        where: { id: req.userId },
        data: { plan: 'PREMIUM', planRenewsAt: periodEnd },
      }),
    ]);

    res.status(201).json({
      user: publicUser(user),
      payment: serializePayment(payment),
      message: 'Pago aprobado. ¡Bienvenido a TerraSmart Premium!',
    });
  }),
);

export default router;
