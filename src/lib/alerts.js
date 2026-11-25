import { prisma } from '../db.js';
import { hoursAgo } from './utils.js';

/**
 * Revisa las lecturas y el estado de los dispositivos y crea alertas nuevas.
 * Evita duplicados dentro de una ventana de 12 horas.
 */
export async function refreshAlerts(userId) {
  const since = hoursAgo(12);
  const soon = new Date(Date.now() + 24 * 3600 * 1000);

  const plants = await prisma.plant.findMany({
    where: { userId },
    include: {
      readings: { take: 1, orderBy: { recordedAt: 'desc' } },
      device: true,
      fertilizations: {
        where: { doneAt: null, scheduledAt: { lte: soon } },
        orderBy: { scheduledAt: 'asc' },
        take: 1,
      },
    },
  });

  const devices = await prisma.device.findMany({ where: { userId } });

  const pending = [];

  const already = async (type, title) =>
    prisma.alert.findFirst({ where: { userId, type, title, createdAt: { gte: since } } });

  for (const plant of plants) {
    const latest = plant.readings[0];
    if (!latest) continue;

    if (latest.moisture < plant.moistureMin) {
      const title = `Humedad baja en ${plant.name}`;
      if (!(await already('LOW_MOISTURE', title))) {
        pending.push({
          userId,
          plantId: plant.id,
          type: 'LOW_MOISTURE',
          severity: latest.moisture < plant.moistureMin - 10 ? 'CRITICAL' : 'WARNING',
          title,
          message: `La humedad está en ${latest.moisture}% y el mínimo recomendado es ${plant.moistureMin}%. Riega ${Math.max(
            3,
            Math.round((plant.moistureMin - latest.moisture) / 4),
          )} minutos.`,
        });
      }
    }

    if (latest.moisture > plant.moistureMax) {
      const title = `Exceso de agua en ${plant.name}`;
      if (!(await already('HIGH_MOISTURE', title))) {
        pending.push({
          userId,
          plantId: plant.id,
          type: 'HIGH_MOISTURE',
          severity: 'INFO',
          title,
          message: `La humedad está en ${latest.moisture}% (máximo ${plant.moistureMax}%). Revisa el drenaje antes del próximo riego.`,
        });
      }
    }

    if (plant.fertilizations[0]) {
      const task = plant.fertilizations[0];
      const title = `Fertilización pendiente: ${plant.name}`;
      if (!(await already('FERTILIZATION', title))) {
        pending.push({
          userId,
          plantId: plant.id,
          type: 'FERTILIZATION',
          severity: 'INFO',
          title,
          message: `Toca aplicar ${task.product}${task.dose ? ` (${task.dose})` : ''} el ${task.scheduledAt.toLocaleDateString(
            'es-MX',
            { day: '2-digit', month: 'short' },
          )}.`,
        });
      }
    }
  }

  for (const device of devices) {
    const stale = Date.now() - new Date(device.lastSeenAt).getTime() > 2 * 3600 * 1000;
    if (stale || device.status === 'OFFLINE') {
      const title = `Sensor ${device.code} desconectado`;
      if (!(await already('DEVICE_OFFLINE', title))) {
        pending.push({
          userId,
          type: 'DEVICE_OFFLINE',
          severity: 'CRITICAL',
          title,
          message: `El sensor ${device.name} no reporta desde ${device.lastSeenAt.toLocaleString('es-MX')}. Revisa la conexión y la batería.`,
        });
      }
    }
    if (device.battery <= 20) {
      const title = `Batería baja en ${device.code}`;
      if (!(await already('BATTERY_LOW', title))) {
        pending.push({
          userId,
          type: 'BATTERY_LOW',
          severity: 'WARNING',
          title,
          message: `Al sensor ${device.name} le queda ${device.battery}% de batería. Cárgalo o cambia las pilas.`,
        });
      }
    }
  }

  if (pending.length) await prisma.alert.createMany({ data: pending });
  return pending.length;
}
