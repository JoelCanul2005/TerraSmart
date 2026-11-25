/**
 * Almacenamiento de imágenes.
 *
 * Si SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY están definidos, las imágenes se
 * suben a Supabase Storage (bucket público). En caso contrario se guardan en
 * `server/uploads` y Express las sirve en `/uploads/...`.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { badRequest } from '../utils/http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const LOCAL_UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

export const ALLOWED_IMAGE_TYPES = Object.keys(EXT_BY_MIME);
export const ALLOWED_IMAGE_LABEL = 'JPG, PNG, WEBP, GIF o AVIF';

const supabase =
  config.supabaseUrl && config.supabaseServiceKey
    ? createClient(config.supabaseUrl, config.supabaseServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export const storageProvider = supabase ? 'supabase' : 'local';

let bucketChecked = false;

async function ensureBucket() {
  if (!supabase || bucketChecked) return;
  const bucket = config.supabaseBucket;
  const { data } = await supabase.storage.getBucket(bucket);
  if (!data) {
    const { error } = await supabase.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: MAX_IMAGE_BYTES,
    });
    // Otro proceso pudo crearlo entre la consulta y la creación.
    if (error && !/already exists|duplicate/i.test(error.message)) throw error;
  }
  bucketChecked = true;
}

const safeFolder = (folder) =>
  String(folder ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 32) || 'misc';

const randomName = (ext) =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

/**
 * Sube una imagen y devuelve su URL pública (absoluta en Supabase, relativa en local).
 * @param {{ buffer: Buffer, mimetype: string, folder?: string }} input
 */
export async function uploadImage({ buffer, mimetype, folder = 'misc' }) {
  if (!buffer?.length) throw badRequest('Selecciona una imagen');

  const ext = EXT_BY_MIME[String(mimetype).toLowerCase()];
  if (!ext) throw badRequest(`Formato no soportado. Usa ${ALLOWED_IMAGE_LABEL}.`);

  const key = `${safeFolder(folder)}/${randomName(ext)}`;

  if (supabase) {
    await ensureBucket();
    const { error } = await supabase.storage.from(config.supabaseBucket).upload(key, buffer, {
      contentType: mimetype,
      cacheControl: '31536000',
      upsert: false,
    });
    if (error) throw new Error(`Supabase Storage: ${error.message}`);

    const { data } = supabase.storage.from(config.supabaseBucket).getPublicUrl(key);
    return { url: data.publicUrl, provider: 'supabase', key, size: buffer.length };
  }

  const target = path.join(LOCAL_UPLOAD_DIR, key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer);
  return { url: `/uploads/${key}`, provider: 'local', key, size: buffer.length };
}
