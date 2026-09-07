import { dispatch } from '@notifications/channels/dispatcher';
import { sendEmailChannel } from '@notifications/channels/email.channel';
import { sendWebhookChannel } from '@notifications/channels/webhook.channel';
import { INotification, isRetryable, NonRetryableError, validateNotification } from '@notifications/contract';

jest.mock('@notifications/logger', () => ({
  createLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }))
}));
jest.mock('@notifications/channels/email.channel', () => ({ sendEmailChannel: jest.fn() }));
jest.mock('@notifications/channels/webhook.channel', () => ({ sendWebhookChannel: jest.fn() }));

const mockSendEmail = sendEmailChannel as unknown as jest.Mock;
const mockSendWebhook = sendWebhookChannel as unknown as jest.Mock;

const base: INotification = {
  id: '22222222-2222-4222-8222-222222222222',
  channel: 'email',
  template: 'verifyEmail',
  to: 'usuario@ejemplo.com'
};

describe('Dispatcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('envia al canal email', async () => {
    await dispatch(base);
    expect(mockSendEmail).toHaveBeenCalledWith(base);
    expect(mockSendWebhook).not.toHaveBeenCalled();
  });

  it('envia al canal webhook', async () => {
    await dispatch({ ...base, channel: 'webhook', to: 'https://ejemplo.com/hook' });
    expect(mockSendWebhook).toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('rechaza un canal desconocido como no reintentable', async () => {
    const notification = { ...base, channel: 'sms' } as unknown as INotification;
    await expect(dispatch(notification)).rejects.toBeInstanceOf(NonRetryableError);
  });
});

describe('Contrato', () => {
  it('acepta una notificacion valida', () => {
    expect(validateNotification(base)).toEqual(base);
  });

  it('rechaza lo que no es un objeto', () => {
    expect(() => validateNotification('hola')).toThrow(NonRetryableError);
    expect(() => validateNotification(null)).toThrow(NonRetryableError);
  });

  it('rechaza campos ausentes o invalidos', () => {
    expect(() => validateNotification({})).toThrow(NonRetryableError);
    expect(() => validateNotification({ ...base, channel: 'paloma-mensajera' })).toThrow(NonRetryableError);
    expect(() => validateNotification({ ...base, to: '' })).toThrow(NonRetryableError);
    expect(() => validateNotification({ ...base, data: 'no-objeto' })).toThrow(NonRetryableError);
  });

  it('distingue errores reintentables de los que no lo son', () => {
    expect(isRetryable(new Error('timeout'))).toBe(true);
    expect(isRetryable(new NonRetryableError('contrato invalido'))).toBe(false);
  });
});
