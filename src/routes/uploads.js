import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import {
  ALLOWED_IMAGE_LABEL,
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  storageProvider,
  uploadImage,
} from '../lib/storage.js';
import { asyncHandler, badRequest } from '../utils/http.js';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.includes(String(file.mimetype).toLowerCase())) {
      cb(badRequest(`Formato no soportado. Usa ${ALLOWED_IMAGE_LABEL}.`));
      return;
    }
    cb(null, true);
  },
});

router.get('/config', (_req, res) => {
  res.json({
    provider: storageProvider,
    maxBytes: MAX_IMAGE_BYTES,
    formats: ALLOWED_IMAGE_LABEL,
  });
});

router.post(
  '/',
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return next(badRequest('La imagen supera los 5 MB'));
      return next(err);
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Adjunta una imagen en el campo "file"');

    const result = await uploadImage({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      folder: req.body?.folder ?? req.query.folder,
    });

    res.status(201).json(result);
  }),
);

export default router;
