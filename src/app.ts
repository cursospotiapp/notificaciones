import express, { Express } from 'express';
import { Logger } from 'winston';

import { createLogger } from '@notifications/logger';
import { shutdown, start } from '@notifications/server';

const log: Logger = createLogger('app');

function initialize(): void {
  const app: Express = express();
  start(app);
  log.info('Servicio de notificaciones iniciado.');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown().then(() => process.exit(0));
  });
}

initialize();
