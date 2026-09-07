import { Logger } from 'winston';

import { config } from '@notifications/config';
import { INotification, ITemplateLocals } from '@notifications/contract';
import { emailTemplates } from '@notifications/helpers';
import { createLogger } from '@notifications/logger';

const log: Logger = createLogger('emailChannel');

/**
 * Canal email: renderiza la plantilla EJS indicada en `template` con los
 * datos del mensaje y la envia por SMTP. Las plantillas de ejemplo viven
 * en `src/emails/<template>/` (html.ejs + subject.ejs).
 */
async function sendEmailChannel(notification: INotification): Promise<void> {
  const locals: ITemplateLocals = {
    appName: config.APP_NAME,
    appLink: config.APP_URL,
    appIcon: config.APP_ICON,
    ...(notification.data ?? {})
  };
  await emailTemplates(notification.template, notification.to, locals);
  log.info(`Notificacion ${notification.id} enviada por email a ${notification.to} (plantilla: ${notification.template}).`);
}

export { sendEmailChannel };
