import { INotification, NonRetryableError } from '@notifications/contract';
import { sendEmailChannel } from '@notifications/channels/email.channel';
import { sendWebhookChannel } from '@notifications/channels/webhook.channel';

/**
 * Despachador: unico punto que decide COMO sale cada notificacion.
 * Para anadir un canal nuevo (sms, push, ftp...):
 *   1. crear `src/channels/<canal>.channel.ts` con `send<Canal>Channel`,
 *   2. anadir el valor al tipo `NotificationChannel` del contrato,
 *   3. anadir un `case` aqui.
 */
async function dispatch(notification: INotification): Promise<void> {
  switch (notification.channel) {
    case 'email':
      await sendEmailChannel(notification);
      break;
    case 'webhook':
      await sendWebhookChannel(notification);
      break;
    default:
      throw new NonRetryableError(`Canal "${notification.channel}" no soportado.`);
  }
}

export { dispatch };
