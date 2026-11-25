export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new ApiError(400, msg, details);
export const unauthorized = (msg = 'Sesión no válida') => new ApiError(401, msg);
export const forbidden = (msg = 'No autorizado') => new ApiError(403, msg);
export const notFound = (msg = 'Recurso no encontrado') => new ApiError(404, msg);
export const premiumRequired = () =>
  new ApiError(402, 'Esta función forma parte del plan Premium', { code: 'PREMIUM_REQUIRED' });

/** Envuelve handlers async para que express capture los errores. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err?.name === 'ZodError') {
    return res.status(400).json({
      error: 'Datos inválidos',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  if (err?.code === 'P2002') {
    return res.status(409).json({ error: 'Ese registro ya existe' });
  }
  if (err?.code === 'P2025') {
    return res.status(404).json({ error: 'Recurso no encontrado' });
  }
  console.error('[api] error inesperado:', err);
  return res.status(500).json({ error: 'Error interno del servidor' });
}
