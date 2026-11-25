import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import plantRoutes from './routes/plants.js';
import alertRoutes from './routes/alerts.js';
import fertilizationRoutes from './routes/fertilizations.js';
import historyRoutes from './routes/history.js';
import zoneRoutes from './routes/zones.js';
import consumptionRoutes from './routes/consumption.js';
import automationRoutes from './routes/automations.js';
import forumRoutes from './routes/forum.js';
import aiRoutes from './routes/ai.js';
import deviceRoutes from './routes/devices.js';
import subscriptionRoutes from './routes/subscription.js';
import uploadRoutes from './routes/uploads.js';
import billingRoutes from './routes/billing.js';
import { LOCAL_UPLOAD_DIR } from './lib/storage.js';
import { errorHandler } from './utils/http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '1mb' }));
  if (process.env.NODE_ENV !== 'test') app.use(morgan('tiny'));

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'terrasmart-api' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/plants', plantRoutes);
  app.use('/api/alerts', alertRoutes);
  app.use('/api/fertilizations', fertilizationRoutes);
  app.use('/api/history', historyRoutes);
  app.use('/api/zones', zoneRoutes);
  app.use('/api/consumption', consumptionRoutes);
  app.use('/api/automations', automationRoutes);
  app.use('/api/forum', forumRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/devices', deviceRoutes);
  app.use('/api/subscription', subscriptionRoutes);
  app.use('/api/uploads', uploadRoutes);
  app.use('/api/billing', billingRoutes);

  // Imágenes subidas al disco local (fallback sin Supabase).
  app.use('/uploads', express.static(LOCAL_UPLOAD_DIR, { maxAge: '7d', fallthrough: true }));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

  // El mismo Express sirve la vista estática de public.
  const publicDir = path.resolve(__dirname, '../public');
  if (fs.existsSync(path.join(publicDir, 'index.html'))) {
    app.use(express.static(publicDir, { maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}

const app = createApp();
export default app;
