import { Client } from '@elastic/elasticsearch';
import { ClusterHealthResponse } from '@elastic/elasticsearch/lib/api/types';
import { Logger } from 'winston';

import { config } from '@notifications/config';
import { createLogger } from '@notifications/logger';

const log: Logger = createLogger('elasticSearch');

const elasticSearchClient = new Client({
  node: config.ELASTICSEARCH_URL
});

/**
 * Elasticsearch es OPCIONAL: solo centraliza logs si ELASTICSEARCH_ENABLED=1.
 * El servicio funciona igual sin el (los logs salen por consola en JSON).
 */
export async function checkConnection(): Promise<void> {
  let isConnected = false;
  while (!isConnected) {
    try {
      const health: ClusterHealthResponse = await elasticSearchClient.cluster.health({});
      log.info(`Elasticsearch disponible (estado del cluster: ${health.status}).`);
      isConnected = true;
    } catch (error) {
      log.error('Sin conexion con Elasticsearch. Reintentando en 10 s...');
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }
}

export async function isElasticsearchReady(): Promise<boolean> {
  try {
    await elasticSearchClient.ping();
    return true;
  } catch {
    return false;
  }
}
