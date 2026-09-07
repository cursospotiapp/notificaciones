import { Channel, ConsumeMessage } from 'amqplib';
import { Logger } from 'winston';

import { dispatch } from '@notifications/channels/dispatcher';
import { config } from '@notifications/config';
import { INotification, isRetryable, validateNotification } from '@notifications/contract';
import { isDuplicate, markAsProcessed } from '@notifications/idempotency';
import { createLogger } from '@notifications/logger';
import { createConnection } from '@notifications/queues/connection';
import { ChannelTopology, DEAD_LETTER_EXCHANGE, DEAD_LETTER_QUEUE, EXCHANGE, TOPOLOGIES } from '@notifications/queues/topology';

const log: Logger = createLogger('consumer');

export type FailureDecision = 'retry' | 'dead-letter';

/**
 * Politica ante un fallo de envio: los errores no reintentables y los que
 * agotan los intentos van a la cola de fallidos; el resto, a reintentos.
 */
export function decideOnFailure(attempts: number, maxRetries: number, error: unknown): FailureDecision {
  if (!isRetryable(error) || attempts + 1 >= maxRetries) {
    return 'dead-letter';
  }
  return 'retry';
}

function readAttempts(msg: ConsumeMessage): number {
  const attempts = msg.properties.headers?.attempts;
  return typeof attempts === 'number' && attempts >= 0 ? attempts : 0;
}

async function declareTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'fanout', { durable: true });
  const dlq = await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
  await channel.bindQueue(dlq.queue, DEAD_LETTER_EXCHANGE, '');
  for (const topology of TOPOLOGIES) {
    const queue = await channel.assertQueue(topology.queue, { durable: true });
    await channel.bindQueue(queue.queue, EXCHANGE, topology.routingKey);
    await channel.assertQueue(topology.retryQueue, {
      durable: true,
      messageTtl: config.RETRY_DELAY_MS,
      deadLetterExchange: EXCHANGE,
      deadLetterRoutingKey: topology.routingKey
    });
  }
}

async function sendToDeadLetter(
  channel: Channel,
  topology: ChannelTopology,
  msg: ConsumeMessage,
  attempts: number,
  error: unknown
): Promise<void> {
  await channel.publish(DEAD_LETTER_EXCHANGE, topology.routingKey, msg.content, {
    persistent: true,
    headers: {
      attempts: attempts + 1,
      originalRoutingKey: topology.routingKey,
      error: error instanceof Error ? error.message : String(error)
    }
  });
  log.error(`Mensaje derivado a fallidos tras ${attempts + 1} intento(s).`);
}

/** Procesa un mensaje: valida, deduplica, despacha y confirma (ack). */
export async function handleMessage(channel: Channel, topology: ChannelTopology, msg: ConsumeMessage | null): Promise<void> {
  if (!msg) {
    return;
  }
  const attempts = readAttempts(msg);
  let notification: INotification;
  try {
    notification = validateNotification(JSON.parse(msg.content.toString()));
  } catch (error) {
    await sendToDeadLetter(channel, topology, msg, attempts, error);
    channel.ack(msg);
    return;
  }
  if (isDuplicate(notification.id)) {
    log.warn(`Notificacion ${notification.id} duplicada; se confirma sin reenviar.`);
    channel.ack(msg);
    return;
  }
  try {
    await dispatch(notification);
    markAsProcessed(notification.id);
    channel.ack(msg);
  } catch (error) {
    const maxRetries = notification.maxRetries ?? config.MAX_RETRIES;
    if (decideOnFailure(attempts, maxRetries, error) === 'retry') {
      channel.sendToQueue(topology.retryQueue, msg.content, {
        persistent: true,
        headers: { attempts: attempts + 1 }
      });
      log.warn(`Reintento ${attempts + 1}/${maxRetries} programado para ${notification.id}.`);
    } else {
      await sendToDeadLetter(channel, topology, msg, attempts, error);
    }
    channel.ack(msg);
  }
}

async function consumeNotifications(channel?: Channel): Promise<void> {
  try {
    let activeChannel = channel;
    if (!activeChannel) {
      const connection = await createConnection();
      activeChannel = connection?.channel;
    }
    if (!activeChannel) {
      log.error('Sin canal RabbitMQ; no se inician los consumidores.');
      return;
    }
    const readyChannel: Channel = activeChannel;
    await declareTopology(readyChannel);
    for (const topology of TOPOLOGIES) {
      await readyChannel.consume(topology.queue, (msg) => {
        void handleMessage(readyChannel, topology, msg);
      });
    }
    log.info('Consumidores en marcha.');
  } catch (error) {
    log.error('Error al iniciar los consumidores:', error);
  }
}

export { consumeNotifications };
