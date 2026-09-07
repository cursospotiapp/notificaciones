/**
 * Contrato de mensajes del sistema de notificaciones.
 *
 * Todo productor (autenticacion, pedidos, pagos, el servicio que sea) publica
 * en RabbitMQ un JSON con esta forma. El contrato es deliberadamente pequeno:
 * lo especifico de cada caso de uso viaja dentro de `data` y cada canal sabe
 * como interpretarlo. Cualquier desviacion se rechaza en la frontera, antes
 * de alcanzar los canales de envio.
 */
export type NotificationChannel = 'email' | 'webhook';

export interface INotification {
  /** Clave de idempotencia: el productor debe generar un UUID v4 por notificacion. */
  id: string;
  /** Canal de salida. Anadir un canal nuevo es anadir un valor + un enviador. */
  channel: NotificationChannel;
  /** Nombre de la plantilla (canal email) o tipo de evento (canal webhook). */
  template: string;
  /** Destino: direccion de correo en `email`, URL http(s) en `webhook`. */
  to: string;
  /** Asunto (email) o titulo del evento (webhook). Opcional. */
  subject?: string;
  /** Datos especificos del caso de uso (nombre de usuario, enlaces, importes...). */
  data?: Record<string, unknown>;
  /** Reintentos maximos para ESTE mensaje; si se omite manda MAX_RETRIES. */
  maxRetries?: number;
}

/** Variables disponibles dentro de las plantillas EJS del canal email. */
export interface ITemplateLocals {
  appName: string;
  appLink: string;
  appIcon: string;
  [key: string]: unknown;
}

/**
 * Error no reintentable: el mensaje jamas tendra exito (contrato invalido,
 * canal desconocido, URL malformada...). Va directo a la cola de fallidos
 * sin consumir reintentos.
 */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Valida un mensaje crudo de la cola y lo convierte al contrato tipado. */
export function validateNotification(raw: unknown): INotification {
  if (!isRecord(raw)) {
    throw new NonRetryableError('El mensaje no es un objeto JSON valido.');
  }
  const { id, channel, template, to, subject, data, maxRetries } = raw;
  if (typeof id !== 'string' || id.length === 0) {
    throw new NonRetryableError('Campo "id" ausente o invalido: se requiere un identificador unico.');
  }
  if (channel !== 'email' && channel !== 'webhook') {
    throw new NonRetryableError(`Canal "${String(channel)}" no soportado. Canales validos: email, webhook.`);
  }
  if (typeof template !== 'string' || template.length === 0) {
    throw new NonRetryableError('Campo "template" ausente o invalido.');
  }
  if (typeof to !== 'string' || to.length === 0) {
    throw new NonRetryableError('Campo "to" ausente o invalido: se requiere un destino.');
  }
  if (subject !== undefined && typeof subject !== 'string') {
    throw new NonRetryableError('Campo "subject" invalido: debe ser texto.');
  }
  if (data !== undefined && !isRecord(data)) {
    throw new NonRetryableError('Campo "data" invalido: debe ser un objeto.');
  }
  if (maxRetries !== undefined && (typeof maxRetries !== 'number' || maxRetries < 0)) {
    throw new NonRetryableError('Campo "maxRetries" invalido: debe ser un numero positivo.');
  }
  const notification: INotification = { id, channel, template, to };
  if (typeof subject === 'string') {
    notification.subject = subject;
  }
  if (data !== undefined && isRecord(data)) {
    notification.data = data;
  }
  if (typeof maxRetries === 'number') {
    notification.maxRetries = maxRetries;
  }
  return notification;
}

/** Un fallo es reintentable salvo que sea un NonRetryableError. */
export function isRetryable(error: unknown): boolean {
  return !(error instanceof NonRetryableError);
}
