import { Logger } from 'winston';

import { config } from '@notifications/config';
import { INotification, NonRetryableError } from '@notifications/contract';
import { createLogger } from '@notifications/logger';

const log: Logger = createLogger('webhookChannel');

/**
 * Canal webhook: entrega la notificacion como POST JSON a la URL indicada
 * en `to`. Sirve para avisar a otros sistemas (Slack, CRMs, automatizaciones)
 * sin acoplarlos por cola. Un timeout o un 5xx es reintentable; una URL
 * malformada o un 4xx definitivo... tambien se reintenta por simplicidad,
 * salvo la URL invalida, que va directa a fallidos.
 */
async function sendWebhookChannel(notification: INotification): Promise<void> {
  let url: URL;
  try {
    url = new URL(notification.to);
  } catch {
    throw new NonRetryableError(`URL de webhook invalida: "${notification.to}".`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new NonRetryableError(`Protocolo no soportado en webhook: "${url.protocol}".`);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.WEBHOOK_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-notification-id': notification.id
      },
      body: JSON.stringify({
        id: notification.id,
        template: notification.template,
        subject: notification.subject,
        data: notification.data ?? {}
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`El webhook ${url.host} respondio ${response.status}.`);
    }
    log.info(`Notificacion ${notification.id} entregada al webhook ${url.host}.`);
  } finally {
    clearTimeout(timeout);
  }
}

export { sendWebhookChannel };
