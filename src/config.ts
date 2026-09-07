import dotenv from 'dotenv';

dotenv.config({});

if (process.env.ENABLE_APM === '1') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('elastic-apm-node').start({
    serviceName: 'notificaciones',
    serverUrl: process.env.ELASTIC_APM_SERVER_URL,
    secretToken: process.env.ELASTIC_APM_SECRET_TOKEN,
    environment: process.env.NODE_ENV,
    active: true,
    captureBody: 'all',
    errorOnAbortedRequests: true,
    captureErrorLogStackTraces: 'always'
  });
}

function numero(valor: string | undefined, defecto: number): number {
  const parsed = Number(valor);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defecto;
}

class Config {
  public NODE_ENV: string;
  public PORT: number;
  public APP_NAME: string;
  public APP_URL: string;
  public APP_ICON: string;
  public SENDER_EMAIL: string;
  public SENDER_EMAIL_PASSWORD: string;
  public SMTP_HOST: string;
  public SMTP_PORT: number;
  public RABBITMQ_URL: string;
  public ELASTICSEARCH_URL: string;
  public ELASTICSEARCH_ENABLED: boolean;
  public MAX_RETRIES: number;
  public RETRY_DELAY_MS: number;
  public PREFETCH_COUNT: number;
  public WEBHOOK_TIMEOUT_MS: number;
  public IDEMPOTENCY_TTL_MS: number;

  constructor() {
    this.NODE_ENV = process.env.NODE_ENV || 'development';
    this.PORT = numero(process.env.PORT, 4001);
    this.APP_NAME = process.env.APP_NAME || 'Notificaciones';
    this.APP_URL = process.env.APP_URL || 'http://localhost:3000';
    this.APP_ICON = process.env.APP_ICON || 'https://i.ibb.co/Kyp2m0t/cover.png';
    this.SENDER_EMAIL = process.env.SENDER_EMAIL || '';
    this.SENDER_EMAIL_PASSWORD = process.env.SENDER_EMAIL_PASSWORD || '';
    this.SMTP_HOST = process.env.SMTP_HOST || 'smtp.ethereal.email';
    this.SMTP_PORT = numero(process.env.SMTP_PORT, 587);
    this.RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
    this.ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
    this.ELASTICSEARCH_ENABLED = process.env.ELASTICSEARCH_ENABLED === '1';
    this.MAX_RETRIES = numero(process.env.MAX_RETRIES, 3);
    this.RETRY_DELAY_MS = numero(process.env.RETRY_DELAY_MS, 30000);
    this.PREFETCH_COUNT = numero(process.env.PREFETCH_COUNT, 10);
    this.WEBHOOK_TIMEOUT_MS = numero(process.env.WEBHOOK_TIMEOUT_MS, 10000);
    this.IDEMPOTENCY_TTL_MS = numero(process.env.IDEMPOTENCY_TTL_MS, 86400000);
  }
}

export const config: Config = new Config();
