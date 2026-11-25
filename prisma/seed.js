/**
 * Datos de demostración de TerraSmart.
 * Uso: npm run db:seed
 *
 * Usuario principal:  joel@terrasmart.mx  /  demo1234  (Premium)
 * Usuarios del foro:  deisy@terrasmart.mx / demo1234
 *                     rodrigo@terrasmart.mx / demo1234
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db.js';
import { generateReport } from '../src/lib/ai.js';
import { clamp, litersFor, round1 } from '../src/lib/utils.js';

// random reproducible
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(2026);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const DEMO_EMAILS = ['joel@terrasmart.mx', 'deisy@terrasmart.mx', 'rodrigo@terrasmart.mx'];
const HOURS = 24 * 30;

const PLANTS = [
  { name: 'Monstera', species: 'Monstera deliciosa', location: 'Sala · junto a la ventana', zone: 'Sala', device: 'TS-01', min: 35, max: 70, every: 4, start: 62, icon: '🌿' },
  { name: 'Ficus lira', species: 'Ficus lyrata', location: 'Sala · esquina norte', zone: 'Sala', device: 'TS-01', min: 30, max: 65, every: 5, start: 52, icon: '🌳' },
  { name: 'Helecho de Boston', species: 'Nephrolepis exaltata', location: 'Sala · estante alto', zone: 'Sala', device: 'TS-01', min: 40, max: 80, every: 3, start: 58, icon: '🌱' },
  { name: 'Albahaca', species: 'Ocimum basilicum', location: 'Terraza · maceta de barro', zone: 'Terraza', device: 'TS-02', min: 35, max: 75, every: 2, start: 55, icon: '🌿' },
  { name: 'Tomate cherry', species: 'Solanum lycopersicum', location: 'Terraza · huerto', zone: 'Terraza', device: 'TS-02', min: 40, max: 80, every: 2, start: 61, icon: '🍅' },
  { name: 'Echeveria', species: 'Echeveria elegans', location: 'Terraza · sol directo', zone: 'Terraza', device: 'TS-02', min: 10, max: 35, every: 10, start: 24, icon: '🪴' },
  { name: 'Potos', species: 'Epipremnum aureum', location: 'Baño · repisa', zone: 'Baño', device: null, min: 30, max: 70, every: 6, start: 64, icon: '🌿' },
  { name: 'Orquídea', species: 'Phalaenopsis', location: 'Baño · cerca de la ventana', zone: 'Baño', device: null, min: 25, max: 55, every: 7, start: 46, icon: '🌸' },
];

const POSTS = [
  {
    author: 0,
    title: 'Mi Monstera sacó una hoja nueva 🎉',
    body: 'Después de tres semanas siguiendo las lecturas del sensor, por fin salió una hoja nueva. La humedad se mantiene entre 45 y 60 % y la moví un poco más cerca de la ventana. ¿Cada cuánto la fertilizan ustedes?',
    tag: 'consejos',
    likes: 24,
    comments: [
      [1, '¡Qué bien! Yo la fertilizo cada 30 días en primavera, con dosis baja.'],
      [2, 'La luz indirecta fue lo que salvó la mía. Se ve increíble.'],
    ],
  },
  {
    author: 1,
    title: 'Hojas amarillas en la albahaca: ¿exceso de riego?',
    body: 'La albahaca de la terraza empezó a amarillear desde abajo. El sensor marca 71 % de humedad y el sustrato se siente húmedo. ¿Es mejor dejarla secar unos días o cambiar la maceta?',
    tag: 'dudas',
    likes: 11,
    comments: [
      [0, 'Casi seguro es exceso. Déjala sin regar 3 días y revisa que la maceta drene.'],
      [2, 'A mí me pasó y era falta de sol. La moví a 5 horas de sol directo y se recuperó.'],
    ],
  },
  {
    author: 2,
    title: 'Guía rápida: cómo leer el historial de humedad',
    body: 'Un consejo para quienes empiezan: no miren solo el número actual. En el historial se ve la pendiente. Si baja 10 puntos en un día, esa planta necesita riegos más cortos y frecuentes. Si baja lento, puedes espaciar.',
    tag: 'consejos',
    likes: 38,
    comments: [[1, 'Muy útil, no lo había pensado así.']],
  },
  {
    author: 1,
    title: '¿Mosquitas blancas en el tomate cherry?',
    body: 'Aparecieron mosquitas blancas en el envés de las hojas del tomate. Ya probé jabón potásico dos veces. ¿Alguna recomendación que no dañe a las abejas?',
    tag: 'plagas',
    likes: 9,
    comments: [[2, 'Trampas amarillas + aceite de neem al atardecer funciona bien.']],
  },
  {
    author: 0,
    title: 'Mi rutina de fertilización con recordatorios',
    body: 'Configuré los recordatorios de fertilización por planta y ya no se me olvida. Monstera y Ficus cada 30 días, orquídea cada 45 con abono específico. Lo mejor: queda el registro de cuándo fue la última vez.',
    tag: 'fertilizacion',
    likes: 17,
    comments: [
      [2, 'Yo hice lo mismo pero con el calendario del celular. Voy a probar aquí.'],
      [1, '¿Qué abono usas para la orquídea?'],
    ],
  },
];

async function main() {
  console.log('• limpiando datos de demostración…');
  await prisma.user.deleteMany({ where: { email: { in: DEMO_EMAILS } } });

  const passwordHash = await bcrypt.hash('demo1234', 10);

  console.log('• creando usuarios…');
  const joel = await prisma.user.create({
    data: {
      name: 'Joel Canul',
      email: 'joel@terrasmart.mx',
      passwordHash,
      plan: 'PREMIUM',
      planRenewsAt: new Date(Date.now() + 22 * 86400000),
    },
  });
  const deisy = await prisma.user.create({
    data: { name: 'Deisy López', email: 'deisy@terrasmart.mx', passwordHash },
  });
  const rodrigo = await prisma.user.create({
    data: { name: 'Rodrigo Esmorto', email: 'rodrigo@terrasmart.mx', passwordHash },
  });
  const authors = [joel, deisy, rodrigo];

  console.log('• creando zonas y dispositivos…');
  const zones = {};
  for (const [name, color, icon] of [
    ['Sala', '#2E8B5F', 'sofa'],
    ['Terraza', '#2C7BB6', 'sun'],
    ['Baño', '#6C4BD1', 'droplet'],
  ]) {
    zones[name] = await prisma.zone.create({ data: { userId: joel.id, name, color, icon } });
  }

  const device1 = await prisma.device.create({
    data: { userId: joel.id, code: 'TS-01', name: 'Sensor Sala', battery: 78, lastSeenAt: new Date() },
  });
  const device2 = await prisma.device.create({
    data: { userId: joel.id, code: 'TS-02', name: 'Sensor Terraza', battery: 16, lastSeenAt: new Date(Date.now() - 5 * 60000) },
  });
  const devices = { 'TS-01': device1, 'TS-02': device2 };

  console.log('• creando plantas, lecturas y riegos (30 días)…');
  const now = Date.now();
  const plants = [];

  for (const cfg of PLANTS) {
    const plant = await prisma.plant.create({
      data: {
        userId: joel.id,
        zoneId: zones[cfg.zone].id,
        deviceId: cfg.device ? devices[cfg.device].id : null,
        name: cfg.name,
        species: cfg.species,
        location: cfg.location,
        notes: `${cfg.icon} ${cfg.species}. Rango objetivo de humedad: ${cfg.min}–${cfg.max}%.`,
        moistureMin: cfg.min,
        moistureMax: cfg.max,
        wateringEveryDays: cfg.every,
        registeredAt: new Date(now - (60 + plants.length * 9) * 86400000),
      },
    });
    plants.push({ ...cfg, id: plant.id });

    // Simulación: la humedad baja poco a poco y sube con cada riego
    let moisture = cfg.start + 6;
    const readings = [];
    const waterings = [];
    let hoursSinceWater = 0;

    for (let h = HOURS; h >= 0; h -= 1) {
      const at = new Date(now - h * 3600000);
      moisture = clamp(moisture - (0.10 + rand() * 0.09), 4, 96);

      const needsWater =
        moisture < cfg.min - 2 && hoursSinceWater > cfg.every * 18 && rand() > 0.55;

      if (h % 3 === 0) {
        readings.push({
          plantId: plant.id,
          deviceId: cfg.device ? devices[cfg.device].id : null,
          moisture: Math.round(moisture),
          temperature: round1(22 + 4 * Math.sin(((at.getHours() - 6) / 24) * Math.PI * 2) + rand()),
          battery: cfg.device === 'TS-01' ? 78 : cfg.device === 'TS-02' ? 16 : null,
          recordedAt: at,
        });
      }

      if (needsWater) {
        const minutes = 3 + Math.floor(rand() * 5);
        moisture = clamp(moisture + minutes * 4.2, 0, 96);
        hoursSinceWater = 0;
        waterings.push({
          userId: joel.id,
          plantId: plant.id,
          zoneId: zones[cfg.zone].id,
          source: rand() > 0.7 ? 'AUTOMATIC' : 'MANUAL',
          status: 'DONE',
          minutes,
          liters: litersFor(minutes),
          startedAt: at,
        });
      }
      hoursSinceWater += 1;
    }

    // La albahaca queda seca a propósito para disparar alertas
    if (cfg.name === 'Albahaca') {
      readings[readings.length - 1].moisture = 22;
      readings[readings.length - 2].moisture = 29;
    }
    if (cfg.name === 'Tomate cherry') {
      readings[readings.length - 1].moisture = 44;
    }

    await prisma.reading.createMany({ data: readings });
    if (waterings.length) await prisma.wateringEvent.createMany({ data: waterings });

    await prisma.plant.update({
      where: { id: plant.id },
      data: {
        lastWateredAt: waterings.length ? waterings[waterings.length - 1].startedAt : null,
      },
    });
  }

  console.log('• alertas y fertilización…');
  const albahaca = plants.find((p) => p.name === 'Albahaca');
  const monstera = plants.find((p) => p.name === 'Monstera');
  const orquidea = plants.find((p) => p.name === 'Orquídea');
  const potos = plants.find((p) => p.name === 'Potos');

  await prisma.alert.createMany({
    data: [
      {
        userId: joel.id,
        plantId: albahaca.id,
        type: 'LOW_MOISTURE',
        severity: 'CRITICAL',
        title: 'Humedad baja en Albahaca',
        message: 'La humedad está en 22% y el mínimo recomendado es 35%. Riega 4 minutos.',
      },
      {
        userId: joel.id,
        type: 'BATTERY_LOW',
        severity: 'WARNING',
        title: 'Batería baja en TS-02',
        message: 'Al sensor Sensor Terraza le queda 16% de batería. Cárgalo o cambia las pilas.',
      },
      {
        userId: joel.id,
        plantId: potos.id,
        type: 'HIGH_MOISTURE',
        severity: 'INFO',
        title: 'Exceso de agua en Potos',
        message: 'La humedad está en 74% (máximo 70%). Revisa el drenaje antes del próximo riego.',
        read: true,
      },
      {
        userId: joel.id,
        plantId: monstera.id,
        type: 'FERTILIZATION',
        severity: 'INFO',
        title: 'Fertilización pendiente: Monstera',
        message: 'Toca aplicar NPK 10-10-10 el próximo viernes.',
        read: true,
      },
    ],
  });

  await prisma.fertilizationTask.createMany({
    data: [
      { plantId: monstera.id, product: 'NPK 10-10-10', dose: '5 g por litro', scheduledAt: new Date(now + 2 * 86400000) },
      { plantId: albahaca.id, product: 'Compost líquido', dose: '10 ml por litro', scheduledAt: new Date(now + 5 * 86400000) },
      { plantId: orquidea.id, product: 'Abono para orquídeas', dose: 'Dosis baja', scheduledAt: new Date(now + 9 * 86400000) },
      {
        plantId: plants.find((p) => p.name === 'Ficus lira').id,
        product: 'NPK 10-10-10',
        dose: '5 g por litro',
        scheduledAt: new Date(now - 6 * 86400000),
        doneAt: new Date(now - 6 * 86400000),
      },
    ],
  });

  console.log('• automatizaciones…');
  await prisma.automationRule.createMany({
    data: [
      {
        userId: joel.id,
        name: 'Riego de Terraza por humedad',
        trigger: 'MOISTURE_BELOW',
        threshold: 30,
        minutes: 5,
        zoneId: zones.Terraza.id,
        enabled: true,
        lastRunAt: new Date(now - 2 * 86400000),
      },
      {
        userId: joel.id,
        name: 'Riego nocturno de Sala',
        trigger: 'SCHEDULE',
        hour: 20,
        minutes: 4,
        weekdays: [1, 3, 5],
        zoneId: zones.Sala.id,
        enabled: false,
      },
    ],
  });

  console.log('• foro…');
  for (const p of POSTS) {
    const post = await prisma.forumPost.create({
      data: {
        userId: authors[p.author].id,
        title: p.title,
        body: p.body,
        tag: p.tag,
        likes: p.likes,
        createdAt: new Date(now - (POSTS.indexOf(p) * 9 + 2) * 3600000),
      },
    });
    for (const [authorIdx, body] of p.comments) {
      await prisma.comment.create({
        data: {
          postId: post.id,
          userId: authors[authorIdx].id,
          body,
          createdAt: new Date(now - (POSTS.indexOf(p) * 9) * 3600000 + 3600000),
        },
      });
    }
  }

  console.log('• conversación de ejemplo y reporte IA…');
  await prisma.chatMessage.createMany({
    data: [
      { userId: joel.id, role: 'USER', content: '¿Cuándo debo regar la Monstera?', createdAt: new Date(now - 3600000) },
      {
        userId: joel.id,
        role: 'ASSISTANT',
        content:
          'La Monstera está dentro de su rango óptimo (35–70%). Su último riego fue hace 2 días, así que puedes esperar uno más antes de volver a regar.',
        createdAt: new Date(now - 3590000),
      },
    ],
  });

  await generateReport(joel.id);

  console.log('• pagos de ejemplo (pasarela sandbox)…');
  await prisma.payment.createMany({
    data: [
      {
        reference: 'TP-DEMO00001',
        amount: 99,
        status: 'DECLINED',
        brand: 'Mastercard',
        last4: '5100',
        holder: 'Joel Canul',
        periodEnd: new Date(now - 9 * 86400000),
        createdAt: new Date(now - 9 * 86400000),
        userId: joel.id,
      },
      {
        reference: 'TP-DEMO00002',
        amount: 99,
        status: 'PAID',
        brand: 'Visa',
        last4: '4242',
        holder: 'Joel Canul',
        periodStart: new Date(now - 8 * 86400000),
        periodEnd: new Date(Date.now() + 22 * 86400000),
        createdAt: new Date(now - 8 * 86400000),
        userId: joel.id,
      },
    ],
  });

  const counts = {
    usuarios: await prisma.user.count(),
    plantas: await prisma.plant.count({ where: { userId: joel.id } }),
    lecturas: await prisma.reading.count({ where: { plant: { userId: joel.id } } }),
    riegos: await prisma.wateringEvent.count({ where: { userId: joel.id } }),
    alertas: await prisma.alert.count({ where: { userId: joel.id } }),
    publicaciones: await prisma.forumPost.count(),
    pagos: await prisma.payment.count({ where: { userId: joel.id } }),
  };

  console.log('\n✔ Datos creados');
  console.table(counts);
  console.log('\n  Login demo:  joel@terrasmart.mx  /  demo1234\n');
}

main()
  .catch((err) => {
    console.error('Error en el seed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
