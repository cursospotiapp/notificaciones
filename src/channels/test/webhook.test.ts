import { sendWebhookChannel } from '@notifications/channels/webhook.channel';
import { INotification, NonRetryableError } from '@notifications/contract';

jest.mock('@notifications/logger', () => ({
  createLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }))
}));

const realFetch = global.fetch;

function notification(to: string): INotification {
  return { id: '33333333-3333-4333-8333-333333333333', channel: 'webhook', template: 'pedido-creado', to };
}

describe('Canal webhook', () => {
  afterEach(() => {
    global.fetch = realFetch;
    jest.clearAllMocks();
  });

  it('rechaza una URL malformada sin intentarlo', async () => {
    global.fetch = jest.fn();
    await expect(sendWebhookChannel(notification('no-es-una-url'))).rejects.toBeInstanceOf(NonRetryableError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rechaza protocolos que no sean http(s)', async () => {
    global.fetch = jest.fn();
    await expect(sendWebhookChannel(notification('ftp://ejemplo.com/hook'))).rejects.toBeInstanceOf(NonRetryableError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('publica el evento como POST JSON con el id en cabecera', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    await sendWebhookChannel(notification('https://ejemplo.com/hook'));

    expect(global.fetch).toHaveBeenCalledWith(
      'https://ejemplo.com/hook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-notification-id': '33333333-3333-4333-8333-333333333333' })
      })
    );
  });

  it('lanza un error reintentable si el destino responde con fallo', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(sendWebhookChannel(notification('https://ejemplo.com/hook'))).rejects.toThrow('500');
  });
});
