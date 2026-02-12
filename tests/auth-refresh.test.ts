/**
 * Unit tests for src/auth-refresh.ts
 *
 * Tests the interactive re-authentication flow that triggers on 401.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
  input: vi.fn(),
}));

vi.mock('../src/config.js', () => ({
  loadCredentials: vi.fn(),
  saveCredentials: vi.fn(),
  loadConfig: () => ({ baseUrl: 'https://api.minara.ai' }),
}));

vi.mock('../src/api/auth.js', () => ({
  sendEmailCode: vi.fn(),
  verifyEmailCode: vi.fn(),
}));

import { confirm, input } from '@inquirer/prompts';
import { loadCredentials, saveCredentials } from '../src/config.js';
import { sendEmailCode, verifyEmailCode } from '../src/api/auth.js';

const mockConfirm = vi.mocked(confirm);
const mockInput = vi.mocked(input);
const mockLoadCredentials = vi.mocked(loadCredentials);
const mockSaveCredentials = vi.mocked(saveCredentials);
const mockSendEmailCode = vi.mocked(sendEmailCode);
const mockVerifyEmailCode = vi.mocked(verifyEmailCode);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('attemptReAuth', () => {
  // ── User declines re-login ────────────────────────────────────────────

  it('should return null when user declines re-login', async () => {
    mockConfirm.mockResolvedValueOnce(false);

    const { attemptReAuth } = await import('../src/auth-refresh.js');
    const result = await attemptReAuth();

    expect(result).toBeNull();
    expect(mockSendEmailCode).not.toHaveBeenCalled();
  });

  // ── Full successful re-auth flow ──────────────────────────────────────

  it('should return new token on successful re-auth (email from saved creds)', async () => {
    mockConfirm.mockResolvedValueOnce(true); // yes, re-login
    mockLoadCredentials.mockReturnValue({ accessToken: 'old', email: 'saved@test.com' });
    mockSendEmailCode.mockResolvedValue({ success: true });
    mockInput.mockResolvedValueOnce('123456'); // verification code
    mockVerifyEmailCode.mockResolvedValue({
      success: true,
      data: {
        id: 'u1',
        access_token: 'new-fresh-token',
        email: 'saved@test.com',
        displayName: 'TestUser',
      },
    });

    const { attemptReAuth } = await import('../src/auth-refresh.js');
    const result = await attemptReAuth();

    expect(result).toBe('new-fresh-token');

    // Should have saved new credentials
    expect(mockSaveCredentials).toHaveBeenCalledWith({
      accessToken: 'new-fresh-token',
      userId: 'u1',
      email: 'saved@test.com',
      displayName: 'TestUser',
    });

    // Should have used saved email
    expect(mockSendEmailCode).toHaveBeenCalledWith({
      email: 'saved@test.com',
      platform: 'web',
    });
  });

  // ── Email not in saved creds → prompt user ──────────────────────────

  it('should prompt for email when not in saved credentials', async () => {
    mockConfirm.mockResolvedValueOnce(true);
    mockLoadCredentials.mockReturnValue({ accessToken: 'old' }); // no email
    mockInput
      .mockResolvedValueOnce('manual@test.com') // email prompt
      .mockResolvedValueOnce('654321');          // code prompt
    mockSendEmailCode.mockResolvedValue({ success: true });
    mockVerifyEmailCode.mockResolvedValue({
      success: true,
      data: { id: 'u2', access_token: 'manual-token' },
    });

    const { attemptReAuth } = await import('../src/auth-refresh.js');
    const result = await attemptReAuth();

    expect(result).toBe('manual-token');
    expect(mockSendEmailCode).toHaveBeenCalledWith({
      email: 'manual@test.com',
      platform: 'web',
    });
  });

  // ── sendEmailCode fails ───────────────────────────────────────────────

  it('should return null when sending email code fails', async () => {
    mockConfirm.mockResolvedValueOnce(true);
    mockLoadCredentials.mockReturnValue({ accessToken: 'old', email: 'user@test.com' });
    mockSendEmailCode.mockResolvedValue({
      success: false,
      error: { code: 429, message: 'Rate limited' },
    });

    const { attemptReAuth } = await import('../src/auth-refresh.js');
    const result = await attemptReAuth();

    expect(result).toBeNull();
    expect(mockVerifyEmailCode).not.toHaveBeenCalled();
  });

  // ── verifyEmailCode fails ─────────────────────────────────────────────

  it('should return null when verification fails', async () => {
    mockConfirm.mockResolvedValueOnce(true);
    mockLoadCredentials.mockReturnValue({ accessToken: 'old', email: 'user@test.com' });
    mockSendEmailCode.mockResolvedValue({ success: true });
    mockInput.mockResolvedValueOnce('wrong-code');
    mockVerifyEmailCode.mockResolvedValue({
      success: false,
      error: { code: 400, message: 'Invalid code' },
    });

    const { attemptReAuth } = await import('../src/auth-refresh.js');
    const result = await attemptReAuth();

    expect(result).toBeNull();
    expect(mockSaveCredentials).not.toHaveBeenCalled();
  });

  // ── No access_token in verify response ──────────────────────────────

  it('should return null when no access_token in response', async () => {
    mockConfirm.mockResolvedValueOnce(true);
    mockLoadCredentials.mockReturnValue({ accessToken: 'old', email: 'user@test.com' });
    mockSendEmailCode.mockResolvedValue({ success: true });
    mockInput.mockResolvedValueOnce('123456');
    mockVerifyEmailCode.mockResolvedValue({
      success: true,
      data: { id: 'u1' }, // no access_token field
    });

    const { attemptReAuth } = await import('../src/auth-refresh.js');
    const result = await attemptReAuth();

    expect(result).toBeNull();
  });

  // ── User cancels prompt (Ctrl+C) ─────────────────────────────────────

  it('should handle prompt cancellation gracefully', async () => {
    mockConfirm.mockRejectedValueOnce(new Error('Prompt was closed'));

    const { attemptReAuth } = await import('../src/auth-refresh.js');
    const result = await attemptReAuth();

    expect(result).toBeNull();
  });
});
