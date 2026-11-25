import { prisma } from '../db.js';
import { getConsumption, getOverview } from './stats.js';
import { daysAgo, round1 } from './utils.js';

const normalize = (text) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const fmtDate = (d) => new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });

/**
 * Asistente con IA simulada: responde con reglas sobre los datos reales del usuario.
 * (Se puede cambiar por un LLM real sin tocar el resto de la app.)
 */
export async function assistantReply(userId, message) {
  const text = normalize(message);
  const overview = await getOverview(userId);
  const plants = overview.plants;

  const named = plants.find((p) => text.includes(normalize(p.name.split(' ')[0])));

  const plantLine = (p) => {
    const m = p.readings[0]?.moisture;
    if (m == null) return `• ${p.name}: aún sin lecturas.`;
    const state = m < p.moistureMin ? 'necesita agua' : m > p.moistureMax ? 'tiene exceso de agua' : 'está en rango óptimo';
    return `• ${p.name} (${p.species}): ${m}% de humedad — ${state}.`;
  };

  if (/^(hola|buenas|hey|que tal|buenos dias|buenas tardes)/.test(text)) {
    return [
      `Hola 👋 Tienes ${plants.length} plantas registradas y la humedad promedio es de ${
        overview.averageMoisture ?? '—'
      }%.`,
      overview.needsWater
        ? `Ahora mismo ${overview.needsWater} ${
            overview.needsWater === 1 ? 'planta necesita' : 'plantas necesitan'
          } agua.`
        : 'Todas tus plantas están dentro del rango recomendado.',
      'Puedo ayudarte con: cuándo regar, consumo de agua, alertas, fertilización o cuidados por especie.',
    ].join('\n');
  }

  if (named && /(regar|riego|agua|humedad|cuando)/.test(text)) {
    const m = named.readings[0]?.moisture ?? null;
    if (m == null) return `Todavía no tengo lecturas de ${named.name}. Verifica que el sensor esté conectado.`;
    if (m < named.moistureMin) {
      const minutes = Math.max(3, Math.round((named.moistureMin - m) / 4));
      return `${named.name} está en ${m}% y su mínimo es ${named.moistureMin}%. Riega unos ${minutes} minutos (≈${round1(
        minutes * 2.4,
      )} L) y vuelve a revisar en 30 minutos.`;
    }
    if (m > named.moistureMax) {
      return `${named.name} está en ${m}%, por encima del máximo (${named.moistureMax}%). No riegues: revisa el drenaje y espera a que baje.`;
    }
    return `${named.name} está en ${m}%, dentro de su rango (${named.moistureMin}–${named.moistureMax}%). Su último riego fue ${
      named.lastWateredAt ? `el ${fmtDate(named.lastWateredAt)}` : 'no registrado'
    }. No necesitas regar todavía.`;
  }

  if (/(regar|riego|cuando|humedad)/.test(text)) {
    const thirsty = plants
      .filter((p) => {
        const m = p.readings[0]?.moisture;
        return typeof m === 'number' && m < p.moistureMin;
      })
      .sort((a, b) => (a.readings[0]?.moisture ?? 0) - (b.readings[0]?.moisture ?? 0));

    if (!thirsty.length) {
      return `Ninguna planta está por debajo de su mínimo. Humedad promedio: ${overview.averageMoisture}%.\n${plants
        .slice(0, 4)
        .map(plantLine)
        .join('\n')}`;
    }
    return [
      `Estas ${thirsty.length} plantas necesitan agua hoy:`,
      ...thirsty.map(plantLine),
      'Consejo: riega temprano y revisa de nuevo en 30 minutos antes de añadir más agua.',
    ].join('\n');
  }

  if (/(consumo|litros|agua usada|cuanta agua|ahorro)/.test(text)) {
    if (overview.weekLiters === 0) return 'Esta semana no hay riegos registrados todavía, así que el consumo es de 0 L.';
    const c = await getConsumption(userId, 7);
    return `En los últimos 7 días usaste ${c.total} L (${c.averagePerDay} L por día). El riego automático te habría ahorrado cerca de ${c.savedPercent}% frente a un riego por calendario.`;
  }

  if (/(alerta|aviso|pendiente)/.test(text)) {
    const alerts = await prisma.alert.findMany({
      where: { userId, read: false },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: 5,
    });
    if (!alerts.length) return 'No tienes alertas sin leer. Todo en orden 🌱';
    return ['Estas son tus alertas abiertas:', ...alerts.map((a) => `• ${a.title}: ${a.message}`)].join('\n');
  }

  if (/(fertiliz|abono|nutriente)/.test(text)) {
    const tasks = await prisma.fertilizationTask.findMany({
      where: { plant: { userId }, doneAt: null, scheduledAt: { lte: daysAgo(-15) } },
      include: { plant: { select: { name: true } } },
      orderBy: { scheduledAt: 'asc' },
      take: 5,
    });
    if (!tasks.length) return 'No hay fertilizaciones programadas en los próximos 15 días.';
    return ['Fertilizaciones próximas:', ...tasks.map((t) => `• ${t.plant.name}: ${t.product} el ${fmtDate(t.scheduledAt)}`)].join(
      '\n',
    );
  }

  if (/(amarill|mancha|enferm|hoja|plaga|marchit)/.test(text)) {
    return [
      'Para hojas amarillas o manchas revisa en este orden:',
      '1. Humedad del sustrato: si está muy húmedo, reduce el riego y mejora el drenaje.',
      '2. Luz: muchas especies pierden color con poca luz indirecta.',
      '3. Nutrientes: amarilleo uniforme suele indicar falta de nitrógeno.',
      '4. Plagas: revisa el envés de las hojas en busca de ácaros o pulgón.',
      named ? `Sobre ${named.name}: su humedad actual es ${named.readings[0]?.moisture ?? '—'}%.` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (/(vacacion|viaje|fuera de casa)/.test(text)) {
    return 'El modo vacaciones riega por zona con la programación que definas y te envía un resumen al volver. Está disponible en Premium, en la sección Cuenta → Modo vacaciones.';
  }

  return [
    'Puedo ayudarte con datos reales de tu jardín. Prueba con:',
    '• "¿Cuándo riego la Monstera?"',
    '• "¿Cómo está la humedad de mis plantas?"',
    '• "¿Cuánta agua he usado esta semana?"',
    '• "¿Tengo alertas pendientes?"',
    '• "Mis hojas están amarillas"',
  ].join('\n');
}

/** Genera (y guarda) un reporte mensual con los datos del usuario. */
export async function generateReport(userId) {
  const days = 30;
  const [consumption, overview, alerts, readings] = await Promise.all([
    getConsumption(userId, days),
    getOverview(userId),
    prisma.alert.findMany({ where: { userId, createdAt: { gte: daysAgo(days) } } }),
    prisma.reading.aggregate({
      where: { plant: { userId }, recordedAt: { gte: daysAgo(days) } },
      _avg: { moisture: true },
      _min: { moisture: true },
      _max: { moisture: true },
      _count: true,
    }),
  ]);

  const driest = [...overview.plants]
    .filter((p) => p.readings[0])
    .sort((a, b) => (a.readings[0].moisture ?? 0) - (b.readings[0].moisture ?? 0))[0];

  const critical = alerts.filter((a) => a.severity === 'CRITICAL').length;
  const avgMoisture = Math.round(readings._avg.moisture ?? 0);

  const summary =
    `En los últimos ${days} días registramos ${readings._count} lecturas de ${overview.plants.length} plantas, ` +
    `con una humedad promedio de ${avgMoisture}%. Se usaron ${consumption.total} L de agua en ${consumption.events} riegos ` +
    `(${consumption.averagePerDay} L/día), un ${consumption.savedPercent}% menos que el riego por calendario. ` +
    `Se generaron ${alerts.length} alertas, de las cuales ${critical} fueron críticas.`;

  const highlights = [
    `Humedad promedio del periodo: ${avgMoisture}% (rango ${readings._min.moisture ?? 0}–${readings._max.moisture ?? 0}%).`,
    `Consumo total: ${consumption.total} L · promedio ${consumption.averagePerDay} L/día.`,
    `Ahorro estimado frente al riego por calendario: ${consumption.savedPercent}%.`,
    driest
      ? `Planta que requiere más atención: ${driest.name} (${driest.readings[0].moisture}% de humedad).`
      : 'Sin plantas con lecturas suficientes para comparar.',
    `${alerts.length} alertas en el periodo · ${alerts.filter((a) => !a.read).length} siguen sin leerse.`,
    `Recomendación: ${
      overview.needsWater > 0
        ? 'ajusta el umbral mínimo de riego o activa una automatización por humedad para las plantas más secas.'
        : 'mantén el calendario actual y revisa la batería de los sensores cada mes.'
    }`,
  ];

  const report = await prisma.aiReport.create({
    data: { userId, period: `Últimos ${days} días`, summary, highlights },
  });

  return report;
}
