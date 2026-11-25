import { moistureStatus } from './utils.js';

export function serializeDevice(d) {
  if (!d) return null;
  return {
    id: d.id,
    code: d.code,
    name: d.name,
    model: d.model,
    status: d.status,
    battery: d.battery,
    firmware: d.firmware,
    lastSeenAt: d.lastSeenAt,
  };
}

export function serializePlant(p) {
  const latest = p.readings?.[0] ?? null;
  return {
    id: p.id,
    name: p.name,
    species: p.species,
    location: p.location,
    notes: p.notes,
    imageUrl: p.imageUrl,
    moistureMin: p.moistureMin,
    moistureMax: p.moistureMax,
    wateringEveryDays: p.wateringEveryDays,
    registeredAt: p.registeredAt,
    lastWateredAt: p.lastWateredAt,
    moisture: latest?.moisture ?? null,
    temperature: latest?.temperature ?? null,
    readingAt: latest?.recordedAt ?? null,
    status: moistureStatus(p, latest?.moisture ?? null),
    zone: p.zone ? { id: p.zone.id, name: p.zone.name, color: p.zone.color } : null,
    device: serializeDevice(p.device),
  };
}

export const plantInclude = {
  readings: { take: 1, orderBy: { recordedAt: 'desc' } },
  zone: true,
  device: true,
};

export const serializePost = (p) => ({
  id: p.id,
  title: p.title,
  body: p.body,
  tag: p.tag,
  imageUrl: p.imageUrl,
  likes: p.likes,
  createdAt: p.createdAt,
  author: p.user ? { id: p.user.id, name: p.user.name } : null,
  commentCount: p._count?.comments ?? p.comments?.length ?? 0,
});
