import { sendEmailChannel } from '@notifications/channels/email.channel';
import { emailTemplates } from '@notifications/helpers';
import { INotification } from '@notifications/contract';

jest.mock('@notifications/logger', () => ({
  createLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }))
}));
jest.mock('@notifications/helpers', () => ({ emailTemplates: jest.fn() }));

const mockEmailTemplates = emailTemplates as unknown as jest.Mock;

describe('Canal email', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renderiza la plantilla con los datos del mensaje mas los de la app', async () => {
    const notification: INotification = {
      id: '44444444-4444-4444-8444-444444444444',
      channel: 'email',
      template: 'verifyEmail',
      to: 'usuario@ejemplo.com',
      data: { username: 'Ana' }
    };
    await sendEmailChannel(notification);

    expect(mockEmailTemplates).toHaveBeenCalledWith(
      'verifyEmail',
      'usuario@ejemplo.com',
      expect.objectContaining({ username: 'Ana', appName: expect.any(String), appLink: expect.any(String) })
    );
  });
});
