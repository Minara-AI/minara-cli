/**
 * Tests for the 401 auto-reauth logic in src/api/client.ts.
 *
 * Separated from client.test.ts because these tests need to mock
 * auth-refresh and process.stdin.isTTY.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock config
vi.mock('../../src/config.js', () => ({
  loadConfig: () => ({ baseUrl: 'https://test-api.minara.ai' }),
}));

// Mock auth-refresh module (used via dynamic import in client.ts)
const mockAttemptReAuth = vi.fn();
vi.mock('../../src/auth-refresh.js', () => ({
  attemptReAuth: mockAttemptReAuth,
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { get, post } from '../../src/api/client.js';

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Save original isTTY and restore after tests
const originalIsTTY = process.stdin.isTTY;

beforeEach(() => {
  mockFetch.mockReset();
  mockAttemptReAuth.mockReset();
});

afterEach(() => {
  Object.defineProperty(process.stdin, 'isTTY', {
    value: originalIsTTY,
    writable: true,
    configurable: true,
  });
});

describe('client 401 auto-reauth', () => {
  // ── 401 without token → normal error ─────────────────────────────────

  it('should return 401 error normally when no token was sent', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Unauthorized' }, 401));

    const res = await get('/public-endpoint');

    expect(res.success).toBe(false);
    expect(res.error?.code).toBe(401);
    expect(mockAttemptReAuth).not.toHaveBeenCalled();
  });

  // ── 401 with token in non-TTY → friendly error, no prompt ────────────

  it('should skip re-auth prompt in non-TTY mode', async () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      writable: true,
      configurable: true,
    });

    mockFetch.mockResolvedValue(jsonResponse({ message: 'Token expired' }, 401));

    const res = await get('/protected', { token: 'expired-token' });

    expect(res.success).toBe(false);
    expect(res.error?.code).toBe(401);
    expect(res.error?.message).toContain('Session expired');
    expect(mockAttemptReAuth).not.toHaveBeenCalled();
  });

  // ── 401 with token in TTY → triggers re-auth ────────────────────────

  it('should trigger re-auth and retry on 401 in TTY mode', async () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });

    // First call: 401 (expired token)
    // Second call (retry): 200 (new token works)
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ message: 'Token expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 1, name: 'success' } }));

    mockAttemptReAuth.mockResolvedValue('fresh-new-token');

    const res = await get<{ id: number; name: string }>('/me', { token: 'old-expired-token' });

    // Should have succeeded on retry
    expect(res.success).toBe(true);
    expect(res.data).toEqual({ id: 1, name: 'success' });

    // attemptReAuth was called
    expect(mockAttemptReAuth).toHaveBeenCalledOnce();

    // Second fetch call should use the new token
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const retryInit = mockFetch.mock.calls[1][1] as RequestInit;
    const retryHeaders = retryInit.headers as Record<string, string>;
    expect(retryHeaders['Authorization']).toBe('Bearer fresh-new-token');
  });

  // ── User declines re-auth → returns 401 error ────────────────────────

  it('should return 401 error when user declines re-auth', async () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });

    mockFetch.mockResolvedValue(jsonResponse({ message: 'Token expired' }, 401));
    mockAttemptReAuth.mockResolvedValue(null); // user declined

    const res = await get('/protected', { token: 'expired-token' });

    expect(res.success).toBe(false);
    expect(res.error?.code).toBe(401);
    expect(mockAttemptReAuth).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledTimes(1); // no retry
  });

  // ── Re-auth succeeds but retry also fails → no infinite loop ────────

  it('should not trigger re-auth again if retry also returns 401', async () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });

    // Both calls return 401
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ message: 'Token expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ message: 'Still unauthorized' }, 401));

    mockAttemptReAuth.mockResolvedValue('supposedly-new-token');

    const res = await get('/protected', { token: 'bad-token' });

    // Should return the retry's 401 error (not loop)
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe(401);

    // Re-auth only called ONCE
    expect(mockAttemptReAuth).toHaveBeenCalledOnce();
    // Fetch called exactly twice: original + retry
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // ── POST with body retries correctly ────────────────────────────────

  it('should preserve request body when retrying after re-auth', async () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });

    mockFetch
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));

    mockAttemptReAuth.mockResolvedValue('new-token');

    const res = await post('/api/action', {
      token: 'old-token',
      body: { amount: 100, chain: 'solana' },
    });

    expect(res.success).toBe(true);

    // Verify the retry preserved the POST body
    const retryInit = mockFetch.mock.calls[1][1] as RequestInit;
    expect(retryInit.method).toBe('POST');
    expect(retryInit.body).toBe(JSON.stringify({ amount: 100, chain: 'solana' }));
  });
});
