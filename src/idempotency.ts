import { config } from '@notifications/config';

/**
 * Deduplicacion best-effort en memoria: RabbitMQ entrega "al menos una vez",
 * asi que un mismo `id` puede llegar repetido (reintentos, reinicios).
 * Los identificadores procesados se recuerdan durante IDEMPOTENCY_TTL_MS.
 * Para despliegues con varias replicas, sustituir por Redis u otro almacen
 * compartido manteniendo esta misma interfaz.
 */
const processed = new Map<string, number>();

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, timestamp] of processed) {
    if (now - timestamp > config.IDEMPOTENCY_TTL_MS) {
      processed.delete(id);
    }
  }
}, config.IDEMPOTENCY_TTL_MS);
cleanupTimer.unref();

export function isDuplicate(id: string): boolean {
  return processed.has(id);
}

export function markAsProcessed(id: string): void {
  processed.set(id, Date.now());
}

/** Solo para pruebas. */
export function resetIdempotency(): void {
  processed.clear();
}
