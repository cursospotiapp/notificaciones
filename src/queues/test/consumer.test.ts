import { Channel, ConsumeMessage } from 'amqplib';

import { dispatch } from '@notifications/channels/dispatcher';
import { isDuplicate, markAsProcessed } from '@notifications/idempotency';
import { consumeNotifications, decideOnFailure, handleMessage } from '@notifications/queues/consumer';
import { TOPOLOGIES } from '@notifications/queues/topology';
import { NonRetryableError } from '@notifications/contract';

jest.mock('@notifications/logger', () => ({
  createLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }))
}));
jest.mock('@notifications/channels/dispatcher', () => ({ dispatch: jest.fn() }));
jest.mock('@notifications/idempotency', () => ({
  isDuplicate: jest.fn(),
  markAsProcessed: jest.fn(),
  resetIdempotency: jest.fn()
}));

const mockDispatch = dispatch as unknown as jest.Mock;
const mockIsDuplicate = isDuplicate as unknown as jest.Mock;
const mockMarkAsProcessed = markAsProcessed as unknown as jest.Mock;

function createChannelMock() {
  return {
    assertExchange: jest.fn(),
    assertQueue: jest.fn().mockImplementation((queue: string) => Promise.resolve({ queue })),
    bindQueue: jest.fn(),
    consume: jest.fn(),
    ack: jest.fn(),
    publish: jest.fn(),
    sendToQueue: jest.fn(),
    checkQueue: jest.fn(),
    prefetch: jest.fn()
  };
}

function createMessage(payload: unknown, attempts = 0): ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(payload)),
    properties: { headers: { attempts } }
  } as unknown as ConsumeMessage;
}

const validPayload = {
  id: '11111111-1111-4111-8111-111111111111',
  channel: 'email',
  template: 'verifyEmail',
  to: 'usuario@ejemplo.com',
  data: { username: 'Ana' }
};

describe('Consumer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsDuplicate.mockReturnValue(false);
    mockDispatch.mockResolvedValue(undefined);
  });

  describe('decideOnFailure', () => {
    it('reintenta un fallo transitorio con intentos restantes', () => {
      expect(decideOnFailure(0, 3, new Error('timeout'))).toBe('retry');
    });

    it('deriva a fallidos cuando se agotan los intentos', () => {
      expect(decideOnFailure(2, 3, new Error('timeout'))).toBe('dead-letter');
    });

    it('deriva a fallidos un error no reintentable aunque queden intentos', () => {
      expect(decideOnFailure(0, 3, new NonRetryableError('contrato invalido'))).toBe('dead-letter');
    });
  });

  describe('consumeNotifications', () => {
    it('declara exchanges, colas, reintentos con TTL y arranca un consumidor por canal', async () => {
      const channel = createChannelMock();
      await consumeNotifications(channel as unknown as Channel);

      expect(channel.assertExchange).toHaveBeenCalledWith('notifications', 'topic', { durable: true });
      expect(channel.assertExchange).toHaveBeenCalledWith('notifications.dlx', 'fanout', { durable: true });
      expect(channel.assertQueue).toHaveBeenCalledWith('notifications.dlq', { durable: true });
      expect(channel.bindQueue).toHaveBeenCalledWith('notifications.dlq', 'notifications.dlx', '');
      expect(channel.assertQueue).toHaveBeenCalledWith(
        'notifications.retry.email',
        expect.objectContaining({ deadLetterExchange: 'notifications', deadLetterRoutingKey: 'notification.email' })
      );
      expect(channel.bindQueue).toHaveBeenCalledWith('notifications.email', 'notifications', 'notification.email');
      expect(channel.bindQueue).toHaveBeenCalledWith('notifications.webhook', 'notifications', 'notification.webhook');
      expect(channel.consume).toHaveBeenCalledTimes(TOPOLOGIES.length);
    });
  });

  describe('handleMessage', () => {
    it('despacha, marca como procesado y confirma un mensaje valido', async () => {
      const channel = createChannelMock();
      await handleMessage(channel as unknown as Channel, TOPOLOGIES[0], createMessage(validPayload));

      expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ id: validPayload.id }));
      expect(mockMarkAsProcessed).toHaveBeenCalledWith(validPayload.id);
      expect(channel.ack).toHaveBeenCalledTimes(1);
      expect(channel.sendToQueue).not.toHaveBeenCalled();
      expect(channel.publish).not.toHaveBeenCalled();
    });

    it('confirma sin reenviar un mensaje duplicado', async () => {
      mockIsDuplicate.mockReturnValue(true);
      const channel = createChannelMock();
      await handleMessage(channel as unknown as Channel, TOPOLOGIES[0], createMessage(validPayload));

      expect(mockDispatch).not.toHaveBeenCalled();
      expect(channel.ack).toHaveBeenCalledTimes(1);
    });

    it('deriva a fallidos un mensaje que viola el contrato', async () => {
      const channel = createChannelMock();
      await handleMessage(channel as unknown as Channel, TOPOLOGIES[0], createMessage({ channel: 'email' }));

      expect(mockDispatch).not.toHaveBeenCalled();
      expect(channel.publish).toHaveBeenCalledWith(
        'notifications.dlx',
        'notification.email',
        expect.any(Buffer),
        expect.objectContaining({ persistent: true })
      );
      expect(channel.ack).toHaveBeenCalledTimes(1);
    });

    it('programa un reintento ante un fallo transitorio', async () => {
      mockDispatch.mockRejectedValue(new Error('SMTP caido'));
      const channel = createChannelMock();
      await handleMessage(channel as unknown as Channel, TOPOLOGIES[0], createMessage(validPayload, 0));

      expect(channel.sendToQueue).toHaveBeenCalledWith('notifications.retry.email', expect.any(Buffer), {
        persistent: true,
        headers: { attempts: 1 }
      });
      expect(channel.publish).not.toHaveBeenCalled();
      expect(channel.ack).toHaveBeenCalledTimes(1);
    });

    it('deriva a fallidos cuando el mensaje trae maxRetries agotado', async () => {
      mockDispatch.mockRejectedValue(new Error('SMTP caido'));
      const channel = createChannelMock();
      const payload = { ...validPayload, maxRetries: 1 };
      await handleMessage(channel as unknown as Channel, TOPOLOGIES[0], createMessage(payload, 0));

      expect(channel.sendToQueue).not.toHaveBeenCalled();
      expect(channel.publish).toHaveBeenCalledWith(
        'notifications.dlx',
        'notification.email',
        expect.any(Buffer),
        expect.objectContaining({ persistent: true })
      );
      expect(channel.ack).toHaveBeenCalledTimes(1);
    });

    it('ignora un mensaje nulo sin romper el consumidor', async () => {
      const channel = createChannelMock();
      await handleMessage(channel as unknown as Channel, TOPOLOGIES[0], null);

      expect(mockDispatch).not.toHaveBeenCalled();
      expect(channel.ack).not.toHaveBeenCalled();
    });
  });
});
