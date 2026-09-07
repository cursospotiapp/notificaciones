import client, { Channel, Connection } from 'amqplib';
import { Logger } from 'winston';

import { config } from '@notifications/config';
import { createLogger } from '@notifications/logger';

const log: Logger = createLogger('queueConnection');

export interface QueueConnection {
  connection: Connection;
  channel: Channel;
}

let active: QueueConnection | undefined;

async function createConnection(): Promise<QueueConnection | undefined> {
  try {
    const connection: Connection = await client.connect(config.RABBITMQ_URL);
    const channel: Channel = await connection.createChannel();
    await channel.prefetch(config.PREFETCH_COUNT);
    active = { connection, channel };
    log.info('Conectado a RabbitMQ.');
    return active;
  } catch (error) {
    log.error('No se pudo conectar a RabbitMQ:', error);
    return undefined;
  }
}

function getChannel(): Channel | undefined {
  return active?.channel;
}

async function closeConnection(): Promise<void> {
  if (!active) {
    return;
  }
  try {
    await active.channel.close();
  } catch (error) {
    log.error('Error al cerrar el canal RabbitMQ:', error);
  }
  try {
    await active.connection.close();
  } catch (error) {
    log.error('Error al cerrar la conexion RabbitMQ:', error);
  }
  active = undefined;
}

export { createConnection, getChannel, closeConnection };
