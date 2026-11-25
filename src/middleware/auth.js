import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { forbidden, premiumRequired, unauthorized } from '../utils/http.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

export const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  plan: u.plan,
  planRenewsAt: u.planRenewsAt,
  vacationMode: u.vacationMode,
  vacationFrom: u.vacationFrom,
  vacationTo: u.vacationTo,
  createdAt: u.createdAt,
});

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw unauthorized('Falta el token de sesión');

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw unauthorized('Token inválido o expirado');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw unauthorized('El usuario ya no existe');

    req.user = user;
    req.userId = user.id;
    next();
  } catch (err) {
    next(err);
  }
}

export function requirePremium(req, _res, next) {
  if (req.user?.plan !== 'PREMIUM') return next(premiumRequired());
  next();
}

export function requireOwner(resourceUserId, req) {
  if (resourceUserId !== req.userId) throw forbidden();
}
