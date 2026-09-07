import winston, { Logger } from 'winston';

/**
 * Registrador estructurado propio del servicio. No depende de ninguna
 * libreria externa: en desarrollo escribe en color por consola y en
 * produccion emite JSON de una linea (listo para Elasticsearch, Loki, etc.).
 */
export function createLogger(service: string): Logger {
  const production = process.env.NODE_ENV === 'production';
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'debug',
    defaultMeta: { service },
    format: production
      ? winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json())
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({ format: 'HH:mm:ss' }),
          winston.format.printf((info) => `${info.timestamp} [${info.service}] ${info.level}: ${info.message}`)
        ),
    transports: [new winston.transports.Console()]
  });
}
