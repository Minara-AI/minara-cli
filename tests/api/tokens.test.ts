/**
 * Unit tests for src/api/tokens.ts
 *
 * These are public endpoints — no auth token required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api/client.js', () => ({
  get: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

import { get } from '../../src/api/client.js';
import {
  getTrendingTokens,
  searchTokens,
  getProjectInfo,
  getTrendingStocks,
  searchStocks,
  getStockInfo,
  discoverTokens,
  getFearGreedIndex,
  getBitcoinMetrics,
} from '../../src/api/tokens.js';

const mockGet = vi.mocked(get);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tokens API (public endpoints)', () => {
  it('getTrendingTokens should GET /tokens/trending-tokens', async () => {
    await getTrendingTokens();
    expect(mockGet).toHaveBeenCalledWith('/tokens/trending-tokens');
  });

  it('searchTokens should GET with keyword query', async () => {
    await searchTokens('solana');
    expect(mockGet).toHaveBeenCalledWith('/tokens/search-tokens', {
      query: { keyword: 'solana' },
    });
  });

  it('getProjectInfo should pass symbol and address', async () => {
    await getProjectInfo('SOL', '0xABC');
    expect(mockGet).toHaveBeenCalledWith('/tokens/project-info', {
      query: { symbol: 'SOL', address: '0xABC' },
    });
  });

  it('getTrendingStocks should GET /stocks/trending-stocks', async () => {
    await getTrendingStocks();
    expect(mockGet).toHaveBeenCalledWith('/stocks/trending-stocks');
  });

  it('searchStocks should GET with keyword', async () => {
    await searchStocks('AAPL');
    expect(mockGet).toHaveBeenCalledWith('/stocks/search-stocks', {
      query: { keyword: 'AAPL' },
    });
  });

  it('getStockInfo should GET with symbol', async () => {
    await getStockInfo('TSLA');
    expect(mockGet).toHaveBeenCalledWith('/stocks/get-stock-info', {
      query: { symbol: 'TSLA' },
    });
  });

  it('discoverTokens should pass riskPreference', async () => {
    await discoverTokens('high');
    expect(mockGet).toHaveBeenCalledWith('/discover/tokens', {
      query: { riskPreference: 'high' },
    });
  });

  it('getFearGreedIndex should GET /discover/fear-greed-index', async () => {
    await getFearGreedIndex();
    expect(mockGet).toHaveBeenCalledWith('/discover/fear-greed-index');
  });

  it('getBitcoinMetrics should GET /discover/bitcoin-metrics', async () => {
    await getBitcoinMetrics();
    expect(mockGet).toHaveBeenCalledWith('/discover/bitcoin-metrics');
  });
});
