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
}));

vi.mock('../../src/api/auth.js', () => ({
  sendEmailCode: vi.fn().mockResolvedValue({ success: true }),
  verifyEmailCode: vi.fn().mockResolvedValue({ success: true, data: { id: 'u1', access_token: 'tok' } }),
  getOAuthUrl: vi.fn().mockResolvedValue({ success: true, data: { url: 'https://oauth.example.com' } }),
  getCurrentUser: vi.fn().mockResolvedValue({ success: true, data: { id: 'u1' } }),
}));

vi.mock('../../src/oauth-server.js', () => ({
  startOAuthServer: vi.fn().mockResolvedValue({
    port: 9999,
    callbackUrl: 'http://localhost:9999/callback',
    waitForCallback: vi.fn().mockResolvedValue({ accessToken: 'tok', rawParams: {} }),
    close: vi.fn(),
  }),
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  // Re-suppress console after module reset
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
      vi.mocked(input).mockResolvedValueOnce('123456'); // verification code

      const { loginCommand } = await import('../../src/commands/login.js');
      await loginCommand.parseAsync(['-e', 'user@test.com'], { from: 'user' });

      expect(mockSend).toHaveBeenCalledWith({ email: 'user@test.com', platform: 'cli' });
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
      vi.mocked(select).mockResolvedValueOnce('email'); // method
      vi.mocked(input)
        .mockResolvedValueOnce('me@test.com') // email
        .mockResolvedValueOnce('654321');      // code

      const { loginCommand } = await import('../../src/commands/login.js');
      await loginCommand.parseAsync([], { from: 'user' });

      expect(mockSend).toHaveBeenCalledWith({ email: 'me@test.com', platform: 'cli' });
    });
  });

  // ── OAuth login ───────────────────────────────────────────────────────

  describe('OAuth login', () => {
    it('should login with Google via --google flag', async () => {
      const { getOAuthUrl } = await import('../../src/api/auth.js');
      const { saveCredentials, loadCredentials } = await import('../../src/config.js');
      const { startOAuthServer } = await import('../../src/oauth-server.js');
      const mockOAuth = vi.mocked(getOAuthUrl);
      const mockSave = vi.mocked(saveCredentials);
      vi.mocked(loadCredentials).mockReturnValue(null);

      vi.mocked(startOAuthServer).mockResolvedValue({
        port: 9999,
        callbackUrl: 'http://localhost:9999/callback',
        waitForCallback: vi.fn().mockResolvedValue({
          accessToken: 'google-jwt',
          userId: 'gu1',
          email: 'g@test.com',
          displayName: 'GoogleUser',
          rawParams: {},
        }),
        close: vi.fn(),
      });

      mockOAuth.mockResolvedValue({
        success: true,
        data: { url: 'https://accounts.google.com/o/oauth2/...' },
      });

      const { loginCommand } = await import('../../src/commands/login.js');
      await loginCommand.parseAsync(['--google'], { from: 'user' });

      expect(mockOAuth).toHaveBeenCalledWith('google', 'http://localhost:9999/callback');
      expect(mockSave).toHaveBeenCalledWith({
        accessToken: 'google-jwt',
        userId: 'gu1',
        email: 'g@test.com',
        displayName: 'GoogleUser',
      });
    });

    it('should login with Apple via --apple flag', async () => {
      const { getOAuthUrl } = await import('../../src/api/auth.js');
      const { loadCredentials } = await import('../../src/config.js');
      const { startOAuthServer } = await import('../../src/oauth-server.js');
      vi.mocked(loadCredentials).mockReturnValue(null);

      vi.mocked(startOAuthServer).mockResolvedValue({
        port: 8888,
        callbackUrl: 'http://localhost:8888/callback',
        waitForCallback: vi.fn().mockResolvedValue({
          accessToken: 'apple-jwt',
          userId: 'au1',
          email: 'a@icloud.com',
          rawParams: {},
        }),
        close: vi.fn(),
      });

      vi.mocked(getOAuthUrl).mockResolvedValue({
        success: true,
        data: { url: 'https://appleid.apple.com/auth/authorize' },
      });

      const { loginCommand } = await import('../../src/commands/login.js');
      await loginCommand.parseAsync(['--apple'], { from: 'user' });

      expect(vi.mocked(getOAuthUrl)).toHaveBeenCalledWith('apple', 'http://localhost:8888/callback');
    });

    it('should fetch user info when callback lacks details', async () => {
      const { getOAuthUrl, getCurrentUser } = await import('../../src/api/auth.js');
      const { saveCredentials, loadCredentials } = await import('../../src/config.js');
      const { startOAuthServer } = await import('../../src/oauth-server.js');
      vi.mocked(loadCredentials).mockReturnValue(null);

      vi.mocked(startOAuthServer).mockResolvedValue({
        port: 7777,
        callbackUrl: 'http://localhost:7777/callback',
        waitForCallback: vi.fn().mockResolvedValue({
          accessToken: 'token-only',
          rawParams: {},
          // no email or displayName
        }),
        close: vi.fn(),
      });

      vi.mocked(getOAuthUrl).mockResolvedValue({
        success: true,
        data: { url: 'https://oauth.test.com' },
      });

      vi.mocked(getCurrentUser).mockResolvedValue({
        success: true,
        data: { id: 'full-id', email: 'fetched@test.com', displayName: 'Fetched' },
      });

      const { loginCommand } = await import('../../src/commands/login.js');
      await loginCommand.parseAsync(['--google'], { from: 'user' });

      expect(vi.mocked(getCurrentUser)).toHaveBeenCalledWith('token-only');
      expect(vi.mocked(saveCredentials)).toHaveBeenLastCalledWith({
        accessToken: 'token-only',
        userId: 'full-id',
        email: 'fetched@test.com',
        displayName: 'Fetched',
      });
    });

    it('should handle OAuth URL fetch failure', async () => {
      const { getOAuthUrl } = await import('../../src/api/auth.js');
      const { loadCredentials } = await import('../../src/config.js');
      const { startOAuthServer } = await import('../../src/oauth-server.js');
      vi.mocked(loadCredentials).mockReturnValue(null);

      vi.mocked(startOAuthServer).mockResolvedValue({
        port: 6666,
        callbackUrl: 'http://localhost:6666/callback',
        waitForCallback: vi.fn(),
        close: vi.fn(),
      });

      vi.mocked(getOAuthUrl).mockResolvedValue({
        success: false,
        error: { code: 404, message: 'Provider not supported' },
      });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as never);

      const { loginCommand } = await import('../../src/commands/login.js');
      await expect(
        loginCommand.parseAsync(['--apple'], { from: 'user' }),
      ).rejects.toThrow('exit');

      exitSpy.mockRestore();
    });
  });

  // ── Already logged in ────────────────────────────────────────────────

  describe('already logged in', () => {
    it('should skip login when user declines re-login', async () => {
      const { loadCredentials } = await import('../../src/config.js');
      const { sendEmailCode } = await import('../../src/api/auth.js');
      const { startOAuthServer } = await import('../../src/oauth-server.js');
      const { confirm } = await import('@inquirer/prompts');

      vi.mocked(loadCredentials).mockReturnValue({ accessToken: 'existing' });
      vi.mocked(confirm).mockResolvedValueOnce(false);

      const { loginCommand } = await import('../../src/commands/login.js');
      await loginCommand.parseAsync([], { from: 'user' });

      expect(vi.mocked(sendEmailCode)).not.toHaveBeenCalled();
      expect(vi.mocked(startOAuthServer)).not.toHaveBeenCalled();
    });
  });
});
