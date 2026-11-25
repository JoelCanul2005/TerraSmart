import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'terrasmart-dev-secret',
  jwtExpiresIn: '7d',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  deviceKey: process.env.DEVICE_KEY ?? 'terra-device-key',
  freeHistoryDays: 7,
  premiumHistoryDays: 365,
  premiumPrice: 99,
  litersPerMinute: 2.4,
  // Supabase Storage (si falta alguna de las dos, se usa disco local)
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  supabaseBucket: process.env.SUPABASE_BUCKET ?? 'terra-images',
};
