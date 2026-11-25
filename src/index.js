import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`  TerraSmart  →  http://localhost:${config.port}`);
  console.log(`\n  TerraSmart API  →  http://localhost:${config.port}/api/health`);
  console.log(`  Entorno: ${process.env.NODE_ENV ?? 'development'}\n`);
});

const shutdown = async () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
