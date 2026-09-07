import path from 'path';

import nodemailer, { Transporter } from 'nodemailer';
import Email from 'email-templates';
import { Logger } from 'winston';

import { config } from '@notifications/config';
import { ITemplateLocals } from '@notifications/contract';
import { createLogger } from '@notifications/logger';

const log: Logger = createLogger('mailHelper');

async function emailTemplates(template: string, receiver: string, locals: ITemplateLocals): Promise<void> {
  try {
    const smtpTransport: Transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      auth: {
        user: config.SENDER_EMAIL,
        pass: config.SENDER_EMAIL_PASSWORD
      }
    });
    const email: Email = new Email({
      message: {
        from: `${config.APP_NAME} <${config.SENDER_EMAIL}>`
      },
      send: true,
      preview: false,
      transport: smtpTransport,
      views: {
        options: {
          extension: 'ejs'
        }
      },
      juice: true,
      juiceResources: {
        preserveImportant: true,
        webResources: {
          relativeTo: path.join(__dirname, '../build')
        }
      }
    });

    await email.send({
      template: path.join(__dirname, '..', 'src/emails', template),
      message: { to: receiver },
      locals
    });
  } catch (error) {
    log.error('Error al renderizar o enviar el email:', error);
    throw error;
  }
}

export { emailTemplates };
