import app from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase } from './database/connect.js';
import { ensureDefaultAdmin } from './database/seed-admin.js';

async function startServer() {
  await connectDatabase();
  await ensureDefaultAdmin();

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'TGSCO API server started');
  });
}

startServer().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exitCode = 1;
});
