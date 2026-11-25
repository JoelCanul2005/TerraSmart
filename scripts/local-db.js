// Levanta un PostgreSQL local sin instalar nada en el sistema.
// Uso:  npm run db:up        (deja la base corriendo en el puerto 55432)
//
// Si ya tienes PostgreSQL instalado, no uses este script:
// solo apunta DATABASE_URL en .env a tu servidor.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import EmbeddedPostgres from 'embedded-postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '..', '.pgdata');

const port = Number(process.env.PG_PORT ?? 55432);
const user = process.env.PG_USER ?? 'terra';
const password = process.env.PG_PASSWORD ?? 'terra';
const database = process.env.PG_DATABASE ?? 'terrasmart';

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user,
  password,
  port,
  persistent: true,
  // UTF8 para poder guardar tildes y emojis sin problemas
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

const initialised = fs.existsSync(path.join(dataDir, 'PG_VERSION'));

console.log(`[db] datos en ${dataDir}`);
if (!initialised) {
  console.log('[db] inicializando cluster (solo la primera vez)…');
  await pg.initialise();
}

await pg.start();
console.log(`[db] PostgreSQL escuchando en 127.0.0.1:${port}`);

try {
  await pg.createDatabase(database);
  console.log(`[db] base de datos "${database}" creada`);
} catch {
  console.log(`[db] base de datos "${database}" ya existe`);
}

console.log('[db] listo. Deja esta ventana abierta mientras desarrollas.');
console.log(`[db] DATABASE_URL=postgresql://${user}:${password}@127.0.0.1:${port}/${database}?schema=public`);

const shutdown = async () => {
  console.log('\n[db] deteniendo…');
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// mantiene el proceso vivo
setInterval(() => {}, 1 << 30);
