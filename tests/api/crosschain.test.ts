/**
 * Unit tests for src/api/crosschain.ts
 *
 * Verifies endpoint paths, HTTP methods, token passing, and request bodies.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api/client.js', () => ({
  get: vi.fn().mockResolvedValue({ success: true, data: {} }),
  post: vi.fn().mockResolvedValue({ success: true, data: {} }),
}));

import { get, post } from '../../src/api/client.js';
import {
  getAccount,
  getAssets,
  swap,
  swaps,
  swapsSimulate,
  transfer,
  getActivities,
  getPnlHistory,
  getStatuses,
} from '../../src/api/crosschain.js';

const mockGet = vi.mocked(get);
const mockPost = vi.mocked(post);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('crosschain API', () => {
  describe('getAccount', () => {
    it('should GET /v1/tx/cross-chain/account with token', async () => {
      await getAccount('tk');
      expect(mockGet).toHaveBeenCalledWith('/v1/tx/cross-chain/account', { token: 'tk' });
    });
  });

  describe('getAssets', () => {
    it('should GET /v1/tx/cross-chain/assets with token', async () => {
      await getAssets('tk');
      expect(mockGet).toHaveBeenCalledWith('/v1/tx/cross-chain/assets', { token: 'tk' });
    });
  });

  describe('swap', () => {
    it('should POST swap DTO with token', async () => {
      const dto = {
        chain: 'solana' as const,
        side: 'buy' as const,
        tokenAddress: '0xABC',
        buyUsdAmountOrSellTokenAmount: '100',
      };
      await swap('tk', dto);

      expect(mockPost).toHaveBeenCalledWith('/v1/tx/cross-chain/swap', {
        token: 'tk',
        body: dto,
      });
    });
  });

  describe('swaps', () => {
    it('should POST multiple swaps', async () => {
      const list = [
        { chain: 'ethereum' as const, side: 'sell' as const, tokenAddress: '0x1', buyUsdAmountOrSellTokenAmount: '50' },
      ];
      await swaps('tk', list);

      expect(mockPost).toHaveBeenCalledWith('/v1/tx/cross-chain/swaps', {
        token: 'tk',
        body: { swaps: list },
      });
    });
  });

  describe('swapsSimulate', () => {
    it('should POST to simulate endpoint', async () => {
      const list = [
        { chain: 'base' as const, side: 'buy' as const, tokenAddress: '0x2', buyUsdAmountOrSellTokenAmount: '25' },
      ];
      await swapsSimulate('tk', list);

      expect(mockPost).toHaveBeenCalledWith('/v1/tx/cross-chain/swaps-simulate', {
        token: 'tk',
        body: { swaps: list },
      });
    });
  });

  describe('transfer', () => {
    it('should POST transfer DTO with token', async () => {
      const dto = {
        chain: 'solana' as const,
        tokenAddress: '0xABC',
        tokenAmount: '10',
        recipient: '0xRecipient',
      };
      await transfer('tk', dto);

      expect(mockPost).toHaveBeenCalledWith('/v1/tx/cross-chain/transfer', {
        token: 'tk',
        body: dto,
      });
    });
  });

  describe('getActivities', () => {
    it('should POST activities query', async () => {
      const dto = { limit: 20, page: 1 };
      await getActivities('tk', dto);

      expect(mockPost).toHaveBeenCalledWith('/v1/tx/cross-chain/activities', {
        token: 'tk',
        body: dto,
      });
    });
  });

  describe('getPnlHistory', () => {
    it('should GET pnl history with type query', async () => {
      await getPnlHistory('tk', 'weekly');

      expect(mockGet).toHaveBeenCalledWith('/v1/tx/cross-chain/pnl/history', {
        token: 'tk',
        query: { type: 'weekly' },
      });
    });
  });

  describe('getStatuses', () => {
    it('should POST transaction IDs', async () => {
      await getStatuses('tk', ['tx1', 'tx2']);

      expect(mockPost).toHaveBeenCalledWith('/v1/tx/cross-chain/statuses', {
        token: 'tk',
        body: { transactionIds: ['tx1', 'tx2'] },
      });
    });
  });
});
