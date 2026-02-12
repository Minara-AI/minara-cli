/**
 * Unit tests for src/api/auth.ts
 *
 * Verifies that auth API functions call the correct endpoints
 * with correct parameters and tokens.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the HTTP client
vi.mock('../../src/api/client.js', () => ({
  get: vi.fn().mockResolvedValue({ success: true, data: {} }),
  post: vi.fn().mockResolvedValue({ success: true, data: {} }),
  del: vi.fn().mockResolvedValue({ success: true, data: {} }),
}));

import { get, post, del } from '../../src/api/client.js';
import {
  sendEmailCode,
  verifyEmailCode,
  getCurrentUser,
  logout,
  deleteAccount,
  getFavoriteTokens,
  addFavoriteTokens,
  getInviteHistory,
} from '../../src/api/auth.js';

const mockGet = vi.mocked(get);
const mockPost = vi.mocked(post);
const mockDel = vi.mocked(del);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('auth API', () => {
  describe('sendEmailCode', () => {
    it('should POST to /auth/email/code with email', async () => {
      await sendEmailCode({ email: 'user@test.com' });

      expect(mockPost).toHaveBeenCalledWith('/auth/email/code', {
        body: { email: 'user@test.com' },
      });
    });

    it('should pass optional fields', async () => {
      await sendEmailCode({
        email: 'user@test.com',
        captchaToken: 'cap123',
        platform: 'cli',
      });

      expect(mockPost).toHaveBeenCalledWith('/auth/email/code', {
        body: {
          email: 'user@test.com',
          captchaToken: 'cap123',
          platform: 'cli',
        },
      });
    });
  });

  describe('verifyEmailCode', () => {
    it('should POST to /auth/email/verify with email and code', async () => {
      await verifyEmailCode({ email: 'user@test.com', code: '123456' });

      expect(mockPost).toHaveBeenCalledWith('/auth/email/verify', {
        body: { email: 'user@test.com', code: '123456' },
      });
    });
  });

  describe('getCurrentUser', () => {
    it('should GET /auth/me with auth token', async () => {
      await getCurrentUser('my-token');

      expect(mockGet).toHaveBeenCalledWith('/auth/me', { token: 'my-token' });
    });
  });

  describe('logout', () => {
    it('should POST /auth/logout with auth token', async () => {
      await logout('my-token');

      expect(mockPost).toHaveBeenCalledWith('/auth/logout', { token: 'my-token' });
    });
  });

  describe('deleteAccount', () => {
    it('should DELETE /auth/delete-account with auth token', async () => {
      await deleteAccount('my-token');

      expect(mockDel).toHaveBeenCalledWith('/auth/delete-account', { token: 'my-token' });
    });
  });

  describe('getFavoriteTokens', () => {
    it('should GET /auth/favorite-tokens with auth token', async () => {
      await getFavoriteTokens('my-token');

      expect(mockGet).toHaveBeenCalledWith('/auth/favorite-tokens', { token: 'my-token' });
    });
  });

  describe('addFavoriteTokens', () => {
    it('should POST /auth/favorite-tokens with token list', async () => {
      await addFavoriteTokens('my-token', { tokens: ['BTC', 'ETH'] });

      expect(mockPost).toHaveBeenCalledWith('/auth/favorite-tokens', {
        token: 'my-token',
        body: { tokens: ['BTC', 'ETH'] },
      });
    });
  });

  describe('getInviteHistory', () => {
    it('should GET /auth/invite-history with auth token', async () => {
      await getInviteHistory('my-token');

      expect(mockGet).toHaveBeenCalledWith('/auth/invite-history', { token: 'my-token' });
    });
  });
});
