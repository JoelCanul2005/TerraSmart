import { prisma } from '../db.js';
import { avg, daysAgo, hoursAgo, isoDay, round1, startOfDay } from './utils.js';

/** Serie de humedad agrupada por hora (≤ 2 días) o por día. */
export async function moistureSeries(userId, hours) {
  const from = hoursAgo(hours);
  const readings = await prisma.reading.findMany({
    where: { plant: { userId }, recordedAt: { gte: from } },
    select: { moisture: true, recordedAt: true },
    orderBy: { recordedAt: 'asc' },
  });

  const bucket = hours <= 26 ? 3600 * 1000 : 24 * 3600 * 1000;
  const buckets = new Map();
  for (const r of readings) {
    const key = Math.floor(new Date(r.recordedAt).getTime() / bucket) * bucket;
    const item = buckets.get(key) ?? { sum: 0, count: 0 };
    item.sum += r.moisture;
    item.count += 1;
    buckets.set(key, item);
  }

  return [...buckets.entries()].map(([key, v]) => ({
    at: new Date(key).toISOString(),
    value: Math.round(v.sum / v.count),
  }));
}

export async function readingsStats(userId, hours) {
  const from = hoursAgo(hours);
  const readings = await prisma.reading.findMany({
    where: { plant: { userId }, recordedAt: { gte: from } },
    select: { moisture: true },
  });
  const values = readings.map((r) => r.moisture);
  return {
    count: values.length,
    average: values.length ? Math.round(avg(values)) : null,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  };
}

/** Consumo de agua agregado: total, por día, por zona y por origen. */
export async function getConsumption(userId, days = 14) {
  const from = startOfDay(daysAgo(days - 1));
  const [events, plantCount] = await Promise.all([
    prisma.wateringEvent.findMany({
      where: { userId, startedAt: { gte: from } },
      include: { zone: { select: { id: true, name: true, color: true } } },
      orderBy: { startedAt: 'asc' },
    }),
    prisma.plant.count({ where: { userId } }),
  ]);

  const total = round1(events.reduce((acc, e) => acc + e.liters, 0));

  const byDayMap = new Map();
  for (let i = days - 1; i >= 0; i -= 1) byDayMap.set(isoDay(daysAgo(i)), 0);
  for (const e of events) {
    const key = isoDay(e.startedAt);
    if (byDayMap.has(key)) byDayMap.set(key, round1(byDayMap.get(key) + e.liters));
  }

  const zoneMap = new Map();
  const sourceMap = new Map();
  for (const e of events) {
    const zoneName = e.zone?.name ?? 'Sin zona';
    const zone = zoneMap.get(zoneName) ?? { name: zoneName, color: e.zone?.color ?? '#6B7A70', liters: 0 };
    zone.liters = round1(zone.liters + e.liters);
    zoneMap.set(zoneName, zone);

    const source = sourceMap.get(e.source) ?? { source: e.source, liters: 0 };
    source.liters = round1(source.liters + e.liters);
    sourceMap.set(e.source, source);
  }

  // Referencia: riego por calendario ≈ 3.2 L por planta al día
  const baseline = round1(plantCount * 3.2 * days);
  const saved = baseline > 0 ? Math.max(0, Math.round(((baseline - total) / baseline) * 100)) : 0;

  return {
    days,
    total,
    averagePerDay: round1(total / days),
    baseline,
    savedPercent: saved,
    byDay: [...byDayMap.entries()].map(([date, liters]) => ({ date, liters })),
    byZone: [...zoneMap.values()].sort((a, b) => b.liters - a.liters),
    bySource: [...sourceMap.values()],
    events: events.length,
  };
}

/** Resumen general usado por el dashboard y el asistente. */
export async function getOverview(userId) {
  const [plants, unreadAlerts, upcoming, weekEvents] = await Promise.all([
    prisma.plant.findMany({
      where: { userId },
      include: {
        readings: { take: 1, orderBy: { recordedAt: 'desc' } },
        zone: true,
        device: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.alert.count({ where: { userId, read: false } }),
    prisma.fertilizationTask.findMany({
      where: { plant: { userId }, doneAt: null },
      include: { plant: { select: { id: true, name: true } } },
      orderBy: { scheduledAt: 'asc' },
      take: 5,
    }),
    prisma.wateringEvent.findMany({
      where: { userId, startedAt: { gte: daysAgo(7) } },
      select: { liters: true, startedAt: true },
    }),
  ]);

  const moistures = plants.map((p) => p.readings[0]?.moisture).filter((m) => typeof m === 'number');
  const weekLiters = round1(weekEvents.reduce((acc, e) => acc + e.liters, 0));

  return {
    plants,
    unreadAlerts,
    upcoming,
    weekLiters,
    averageMoisture: moistures.length ? Math.round(avg(moistures)) : null,
    needsWater: plants.filter((p) => {
      const m = p.readings[0]?.moisture;
      return typeof m === 'number' && m < p.moistureMin;
    }).length,
  };
}
