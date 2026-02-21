/**
 * Integration tests for the login command.
 *
 * Commander commands are stateful singletons, so we must reset modules
 * between tests to get a fresh loginCommand instance each time.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (declared at top level — survive module resets) ─────────────────

vi.mock('../../src/config.js', () => ({
  loadCredentials: vi.fn().mockReturnValue(null),
  saveCredentials: vi.fn(),
  loadConfig: () => ({ baseUrl: 'https://api.minara.ai' }),
  saveConfig: vi.fn(),
}));

vi.mock('../../src/api/auth.js', () => ({
  sendEmailCode: vi.fn().mockResolvedValue({ success: true }),
  verifyEmailCode: vi.fn().mockResolvedValue({ success: true, data: { id: 'u1', access_token: 'tok' } }),
  startDeviceAuth: vi.fn(),
  getDeviceAuthStatus: vi.fn(),
}));

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  input: vi.fn(),
  confirm: vi.fn().mockResolvedValue(true),
}));

vi.mock('ora', () => ({
  default: () => ({ start: () => ({ stop: () => {}, text: '' }) }),
}));

vi.mock('../../src/utils.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/utils.js')>('../../src/utils.js');
  return {
    ...actual,
    spinner: () => ({ stop: () => {}, text: '' }),
    openBrowser: vi.fn(),
  };
});

vi.mock('../../src/touchid.js', () => ({
  isTouchIdAvailable: vi.fn().mockReturnValue(false),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('login command', () => {
  // ── Email login ───────────────────────────────────────────────────────

  describe('email login', () => {
    it('should login with email via --email flag', async () => {
      const { verifyEmailCode, sendEmailCode } = await import('../../src/api/auth.js');
      const { saveCredentials } = await import('../../src/config.js');
      const mockVerify = vi.mocked(verifyEmailCode);
      const mockSend = vi.mocked(sendEmailCode);
      const mockSave = vi.mocked(saveCredentials);

      mockSend.mockResolvedValue({ success: true });
      mockVerify.mockResolvedValue({
        success: true,
        data: { id: 'u1', access_token: 'jwt-token', email: 'user@test.com', displayName: 'TestUser' },
      });

      const { input } = await import('@inquirer/prompts');
      vi.mocked(input).mockResolvedValueOnce('123456');

      const { loginCommand } = await import('../../src/commands/login.js');
      await loginCommand.parseAsync(['-e', 'user@test.com'], { from: 'user' });

      expect(mockSend).toHaveBeenCalledWith({ email: 'user@test.com', platform: 'web' });
      expect(mockSave).toHaveBeenCalledWith({
        accessToken: 'jwt-token',
        userId: 'u1',
        email: 'user@test.com',
        displayName: 'TestUser',
      });
    });

    it('should prompt for email when email method selected interactively', async () => {
      const { sendEmailCode, verifyEmailCode } = await import('../../src/api/auth.js');
      const mockSend = vi.mocked(sendEmailCode);
      vi.mocked(verifyEmailCode).mockResolvedValue({
        success: true,
        data: { id: 'u2', access_token: 'tok2', email: 'me@test.com' },
      });
      mockSend.mockResolvedValue({ success: true });

      const { loadCredentials } = await import('../../src/config.js');
      vi.mocked(loadCredentials).mockReturnValue(null);

      const { select, input } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValueOnce('email');
      vi.mocked(input)
        .mockResolvedValueOnce('me@test.com')
        .mockResolvedValueOnce('654321');

      const { loginCommand } = await import('../../src/commands/login.js');
      await loginCommand.parseAsync([], { from: 'user' });

      expect(mockSend).toHaveBeenCalledWith({ email: 'me@test.com', platform: 'web' });
    });
  });

  // ── Device login ────────────────────────────────────────────────────────

  describe('device login', () => {
    it('should login with device code via --device flag', async () => {
      const { startDeviceAuth, getDeviceAuthStatus } = await import('../../src/api/auth.js');
      const { saveCredentials, loadCredentials } = await import('../../src/config.js');
      vi.mocked(loadCredentials).mockReturnValue(null);

      vi.mocked(startDeviceAuth).mockResolvedValue({
        success: true,
        data: {
          device_code: 'dev123',
          user_code: 'ABCD-1234',
          verification_url: 'https://minara.ai/device',
          expires_in: 600,
          interval: 1,
        },
      });

      vi.mocked(getDeviceAuthStatus).mockResolvedValue({
        success: true,
        data: {
          status: 'completed',
          access_token: 'device-jwt',
          user: { id: 'du1', email: 'dev@test.com', displayName: 'DevUser' },
        },
      });

      const { loginCommand } = await import('../../src/commands/login.js');
      await loginCommand.parseAsync(['--device'], { from: 'user' });

      expect(vi.mocked(startDeviceAuth)).toHaveBeenCalled();
      expect(vi.mocked(saveCredentials)).toHaveBeenCalledWith({
        accessToken: 'device-jwt',
        userId: 'du1',
        email: 'dev@test.com',
        displayName: 'DevUser',
      });
    });

    it('should be the default method in interactive selection', async () => {
      const { startDeviceAuth, getDeviceAuthStatus } = await import('../../src/api/auth.js');
      const { loadCredentials } = await import('../../src/config.js');
      vi.mocked(loadCredentials).mockReturnValue(null);

      const { select } = await import('@inquirer/prompts');
      vi.mocked(select).mockResolvedValueOnce('device');

      vi.mocked(startDeviceAuth).mockResolvedValue({
        success: true,
        data: {
          device_code: 'dev456',
          user_code: 'EFGH-5678',
          verification_url: 'https://minara.ai/device',
          expires_in: 600,
          interval: 1,
        },
      });

      vi.mocked(getDeviceAuthStatus).mockResolvedValue({
        success: true,
        data: {
          status: 'completed',
          access_token: 'dev-tok',
          user: { id: 'du2', email: 'dev2@test.com' },
        },
      });

      const { loginCommand } = await import('../../src/commands/login.js');
      await loginCommand.parseAsync([], { from: 'user' });

      expect(vi.mocked(select)).toHaveBeenCalledWith(
        expect.objectContaining({
          choices: expect.arrayContaining([
            expect.objectContaining({ value: 'device' }),
          ]),
        }),
      );
      expect(vi.mocked(startDeviceAuth)).toHaveBeenCalled();
    });
  });

  // ── Already logged in ────────────────────────────────────────────────

  describe('already logged in', () => {
    it('should skip login when user declines re-login', async () => {
      const { loadCredentials } = await import('../../src/config.js');
      const { sendEmailCode, startDeviceAuth } = await import('../../src/api/auth.js');
      const { confirm } = await import('@inquirer/prompts');

      vi.mocked(loadCredentials).mockReturnValue({ accessToken: 'existing' });
      vi.mocked(confirm).mockResolvedValueOnce(false);

      const { loginCommand } = await import('../../src/commands/login.js');
      await loginCommand.parseAsync([], { from: 'user' });

      expect(vi.mocked(sendEmailCode)).not.toHaveBeenCalled();
      expect(vi.mocked(startDeviceAuth)).not.toHaveBeenCalled();
    });
  });
});
