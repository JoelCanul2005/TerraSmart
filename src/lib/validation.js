import { z } from 'zod';

/**
 * Acepta una URL absoluta (http/https) o una ruta relativa servida por la API
 * (`/uploads/...`), que es lo que devuelve `POST /api/uploads` cuando no hay
 * Supabase configurado.
 */
export const imageUrlSchema = z
  .string()
  .trim()
  .min(1, 'La URL de la imagen está vacía')
  .max(500, 'La URL de la imagen es demasiado larga')
  .refine((value) => /^https?:\/\//i.test(value) || /^\/uploads\//.test(value), {
    message: 'Usa una URL http(s) o sube la imagen desde la app',
  })
  .nullish();
