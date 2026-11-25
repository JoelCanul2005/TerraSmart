import { prisma } from '../db.js';
import { notFound } from '../utils/http.js';
import { clamp, litersFor, round1 } from './utils.js';

/**
 * Riega una planta: registra el evento, el consumo y simula la subida de humedad.
 */
export async function waterPlant({ userId, plantId, minutes, source = 'MANUAL', zoneId = null }) {
  const plant = await prisma.plant.findFirst({
    where: { id: plantId, userId },
    include: { readings: { take: 1, orderBy: { recordedAt: 'desc' } } },
  });
  if (!plant) throw notFound('Planta no encontrada');

  const liters = litersFor(minutes);
  const previous = plant.readings[0]?.moisture ?? 35;
  const boosted = clamp(Math.round(previous + minutes * 3.2), 0, 95);

  const [event] = await prisma.$transaction([
    prisma.wateringEvent.create({
      data: { userId, plantId, zoneId, minutes, liters, source, status: 'DONE' },
    }),
    prisma.plant.update({ where: { id: plantId }, data: { lastWateredAt: new Date() } }),
    prisma.reading.create({
      data: {
        plantId,
        deviceId: plant.deviceId,
        moisture: boosted,
        temperature: plant.readings[0]?.temperature ?? 24,
      },
    }),
  ]);

  return { event, liters, moisture: boosted };
}

/** Riega todas las plantas de una zona y devuelve el total de agua. */
export async function waterZone({ userId, zoneId, minutes, source = 'ZONE' }) {
  const zone = await prisma.zone.findFirst({
    where: { id: zoneId, userId },
    include: { plants: true },
  });
  if (!zone) throw notFound('Zona no encontrada');
  if (!zone.plants.length) throw notFound('La zona no tiene plantas');

  let liters = 0;
  for (const plant of zone.plants) {
    const res = await waterPlant({ userId, plantId: plant.id, minutes, source, zoneId });
    liters += res.liters;
  }

  return { zone: { id: zone.id, name: zone.name }, plants: zone.plants.length, minutes, liters: round1(liters) };
}
