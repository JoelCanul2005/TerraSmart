import { config } from '../config.js';

export const round1 = (n) => Math.round(n * 10) / 10;
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

export const litersFor = (minutes) => round1(minutes * config.litersPerMinute);

export const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const daysAgo = (n) => {
  const x = new Date();
  x.setDate(x.getDate() - n);
  return x;
};

export const hoursAgo = (n) => new Date(Date.now() - n * 3600 * 1000);

export const isoDay = (d) => new Date(d).toISOString().slice(0, 10);

export function moistureStatus(plant, moisture) {
  if (moisture == null) return 'sin-datos';
  if (moisture < plant.moistureMin) return 'baja';
  if (moisture > plant.moistureMax) return 'alta';
  return 'optima';
}

/** "hace 5 min", "hace 2 h", "ayer" */
export function relativeTime(date) {
  const diff = Date.now() - new Date(date).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'ayer';
  if (d < 30) return `hace ${d} días`;
  return new Date(date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}
