import 'express-async-errors';
import http from 'http';

import { Application } from 'express';
import { Logger } from 'winston';

import { config } from '@notifications/config';
import { checkConnection, isElasticsearchReady } from '@notifications/elasticsearch';
import { createLogger } from '@notifications/logger';
import { healthRoutes } from '@notifications/routes';
import { closeConnection, createConnection, getChannel } from '@notifications/queues/connection';
import { consumeNotifications } from '@notifications/queues/consumer';
import { DEAD_LETTER_QUEUE } from '@notifications/queues/topology';

const log: Logger = createLogger('server');

let httpServer: http.Server | undefined;

export function start(app: Application): void {
  httpServer = startHttpServer(app);
  app.use('', healthRoutes(checkReadiness));
  void startQueues();
  startElasticSearch();
}

async function checkReadiness(): Promise<Record<string, string>> {
  const dependencias: Record<string, string> = {};
  const channel = getChannel();
  if (!channel) {
    throw new Error('rabbitmq: sin conexion');
  }
  await channel.checkQueue(DEAD_LETTER_QUEUE);
  dependencias.rabbitmq = 'ok';
  if (config.ELASTICSEARCH_ENABLED) {
    dependencias.elasticsearch = (await isElasticsearchReady()) ? 'ok' : 'no disponible';
  }
  return dependencias;
}

async function startQueues(): Promise<void> {
  const connection = await createConnection();
  if (!connection) {
    log.error('RabbitMQ no disponible; reintentando en 5 s...');
    setTimeout(() => {
      void startQueues();
    }, 5000);
    return;
  }
  await consumeNotifications(connection.channel);
}

function startElasticSearch(): void {
  if (!config.ELASTICSEARCH_ENABLED) {
    log.info('Elasticsearch desactivado (ELASTICSEARCH_ENABLED=0); los logs salen por consola.');
    return;
  }
  void checkConnection();
}

function startHttpServer(app: Application): http.Server {
  const server: http.Server = new http.Server(app);
  server.listen(config.PORT, () => {
    log.info(`Servicio de notificaciones escuchando en el puerto ${config.PORT} (pid ${process.pid}).`);
  });
  return server;
}

export async function shutdown(): Promise<void> {
  log.info('Apagando el servicio...');
  await closeConnection();
  const server = httpServer;
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  httpServer = undefined;
  log.info('Servicio detenido.');
}
