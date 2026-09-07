import { NotificationChannel } from '@notifications/contract';

/**
 * Topologia RabbitMQ del sistema.
 *
 *   exchange `notifications` (topic)
 *     |-- routing key `notification.email`   -> cola `notifications.email`
 *     |-- routing key `notification.webhook` -> cola `notifications.webhook`
 *   exchange `notifications.dlx` (fanout) -> cola `notifications.dlq`
 *
 * Cada canal tiene ademas su cola de reintentos con TTL: el mensaje espera
 * ahi RETRY_DELAY_MS y la propia caducidad lo devuelve al exchange principal
 * (dead-lettering circular), sin hilos ni temporizadores en el codigo.
 */
export const EXCHANGE = 'notifications';
export const DEAD_LETTER_EXCHANGE = 'notifications.dlx';
export const DEAD_LETTER_QUEUE = 'notifications.dlq';

export interface ChannelTopology {
  channel: NotificationChannel;
  queue: string;
  routingKey: string;
  retryQueue: string;
}

export const TOPOLOGIES: ChannelTopology[] = [
  {
    channel: 'email',
    queue: 'notifications.email',
    routingKey: 'notification.email',
    retryQueue: 'notifications.retry.email'
  },
  {
    channel: 'webhook',
    queue: 'notifications.webhook',
    routingKey: 'notification.webhook',
    retryQueue: 'notifications.retry.webhook'
  }
];
