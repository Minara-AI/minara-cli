/**
 * Unit tests for src/api/perps.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api/client.js', () => ({
  get: vi.fn().mockResolvedValue({ success: true, data: {} }),
  post: vi.fn().mockResolvedValue({ success: true, data: {} }),
}));

import { get, post } from '../../src/api/client.js';

// Dynamically import after mock setup
const perps = await import('../../src/api/perps.js');

const mockGet = vi.mocked(get);
const mockPost = vi.mocked(post);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('perps API', () => {
  it('deposit should POST /v1/tx/perps/deposit', async () => {
    await perps.deposit('tk', { usdcAmount: 100 });
    expect(mockPost).toHaveBeenCalledWith('/v1/tx/perps/deposit', {
      token: 'tk', body: { usdcAmount: 100 },
    });
  });

  it('withdraw should POST /v1/tx/perps/withdraw', async () => {
    await perps.withdraw('tk', { usdcAmount: 50, toAddress: '0xAddr' });
    expect(mockPost).toHaveBeenCalledWith('/v1/tx/perps/withdraw', {
      token: 'tk', body: { usdcAmount: 50, toAddress: '0xAddr' },
    });
  });

  it('placeOrders should POST /v1/tx/perps/place-orders', async () => {
    const dto = { orders: [{ coin: 'ETH' }], grouping: 'na' as const };
    await perps.placeOrders('tk', dto);
    expect(mockPost).toHaveBeenCalledWith('/v1/tx/perps/place-orders', {
      token: 'tk', body: dto,
    });
  });

  it('cancelOrders should POST /v1/tx/perps/cancel-orders', async () => {
    await perps.cancelOrders('tk', { cancels: [{ oid: 1 }] });
    expect(mockPost).toHaveBeenCalledWith('/v1/tx/perps/cancel-orders', {
      token: 'tk', body: { cancels: [{ oid: 1 }] },
    });
  });

  it('updateLeverage should POST /v1/tx/perps/update-leverage', async () => {
    const dto = { symbol: 'ETH', isCross: true, leverage: 10 };
    await perps.updateLeverage('tk', dto);
    expect(mockPost).toHaveBeenCalledWith('/v1/tx/perps/update-leverage', {
      token: 'tk', body: dto,
    });
  });

  it('getPositions should GET /v1/tx/perps/positions/all', async () => {
    await perps.getPositions('tk');
    expect(mockGet).toHaveBeenCalledWith('/v1/tx/perps/positions/all', { token: 'tk' });
  });

  it('getCompletedTrades should GET /v1/tx/perps/completed-trades/all', async () => {
    await perps.getCompletedTrades('tk');
    expect(mockGet).toHaveBeenCalledWith('/v1/tx/perps/completed-trades/all', { token: 'tk' });
  });

  it('getTokenPrices should GET /v1/tx/perps/token/prices', async () => {
    await perps.getTokenPrices('tk');
    expect(mockGet).toHaveBeenCalledWith('/v1/tx/perps/token/prices', { token: 'tk' });
  });

  it('getFundRecords should GET with page and limit', async () => {
    await perps.getFundRecords('tk', 1, 20);
    expect(mockGet).toHaveBeenCalledWith('/v1/tx/perps/fund-records', {
      token: 'tk', query: { page: 1, limit: 20 },
    });
  });

  it('getAccountSummary should GET /v1/fully-managed/account-summary', async () => {
    await perps.getAccountSummary('tk');
    expect(mockGet).toHaveBeenCalledWith('/v1/fully-managed/account-summary', { token: 'tk' });
  });

  it('getEquityHistory should GET /v1/tx/perps/equity-history-chart/all', async () => {
    await perps.getEquityHistory('tk');
    expect(mockGet).toHaveBeenCalledWith('/v1/tx/perps/equity-history-chart/all', { token: 'tk' });
  });
});

// ── Perp Wallets (multi sub-account) ─────────────────────────────────────

describe('perp-wallets API', () => {
  it('listSubAccounts should GET /v1/perp-wallets', async () => {
    await perps.listSubAccounts('tk');
    expect(mockGet).toHaveBeenCalledWith('/v1/perp-wallets', { token: 'tk' });
  });

  it('createSubAccount should POST /v1/perp-wallets with name', async () => {
    await perps.createSubAccount('tk', { name: 'My Wallet' });
    expect(mockPost).toHaveBeenCalledWith('/v1/perp-wallets', {
      token: 'tk', body: { name: 'My Wallet' },
    });
  });

  it('renameSubAccount should POST /v1/perp-wallets/rename', async () => {
    await perps.renameSubAccount('tk', { subAccountId: 'sub1', name: 'New Name' });
    expect(mockPost).toHaveBeenCalledWith('/v1/perp-wallets/rename', {
      token: 'tk', body: { subAccountId: 'sub1', name: 'New Name' },
    });
  });

  it('getSubAccountSummary should GET /v1/perp-wallets/summary with subAccountId query', async () => {
    await perps.getSubAccountSummary('tk', 'sub1');
    expect(mockGet).toHaveBeenCalledWith('/v1/perp-wallets/summary', {
      token: 'tk', query: { subAccountId: 'sub1' },
    });
  });

  it('getAggregatedSummary should GET /v1/perp-wallets/aggregated-summary', async () => {
    await perps.getAggregatedSummary('tk');
    expect(mockGet).toHaveBeenCalledWith('/v1/perp-wallets/aggregated-summary', { token: 'tk' });
  });

  it('getSubAccountRecords should GET /v1/perp-wallets/records with query params', async () => {
    await perps.getSubAccountRecords('tk', 'sub1', 1, 20);
    expect(mockGet).toHaveBeenCalledWith('/v1/perp-wallets/records', {
      token: 'tk', query: { subAccountId: 'sub1', page: 1, limit: 20 },
    });
  });

  it('getSubAccountFills should GET /v1/perp-wallets/fills with subAccountId and startTime', async () => {
    await perps.getSubAccountFills('tk', 'sub1', 1700000000000);
    expect(mockGet).toHaveBeenCalledWith('/v1/perp-wallets/fills', {
      token: 'tk', query: { subAccountId: 'sub1', startTime: 1700000000000 },
    });
  });

  it('getSubAccountOpenOrders should GET /v1/perp-wallets/open-orders', async () => {
    await perps.getSubAccountOpenOrders('tk', 'sub1');
    expect(mockGet).toHaveBeenCalledWith('/v1/perp-wallets/open-orders', {
      token: 'tk', query: { subAccountId: 'sub1' },
    });
  });

  it('transferFunds should POST /v1/perp-wallets/transfer', async () => {
    const dto = { fromSubAccountId: 'sub1', toSubAccountId: 'sub2', amount: 100 };
    await perps.transferFunds('tk', dto);
    expect(mockPost).toHaveBeenCalledWith('/v1/perp-wallets/transfer', {
      token: 'tk', body: dto,
    });
  });

  it('transferFunds should work without fromSubAccountId (default account)', async () => {
    const dto = { toSubAccountId: 'sub2', amount: 50 };
    await perps.transferFunds('tk', dto);
    expect(mockPost).toHaveBeenCalledWith('/v1/perp-wallets/transfer', {
      token: 'tk', body: dto,
    });
  });

  it('sweepFunds should POST /v1/perp-wallets/sweep', async () => {
    await perps.sweepFunds('tk', { subAccountId: 'sub1' });
    expect(mockPost).toHaveBeenCalledWith('/v1/perp-wallets/sweep', {
      token: 'tk', body: { subAccountId: 'sub1' },
    });
  });
});

// ── Autopilot (Fully Managed Strategy) ───────────────────────────────────

describe('autopilot API', () => {
  it('getStrategies should GET /v1/fully-managed/strategies', async () => {
    await perps.getStrategies('tk');
    expect(mockGet).toHaveBeenCalledWith('/v1/fully-managed/strategies', { token: 'tk' });
  });

  it('getSupportedSymbols should GET /v1/fully-managed/supported-symbols', async () => {
    await perps.getSupportedSymbols('tk');
    expect(mockGet).toHaveBeenCalledWith('/v1/fully-managed/supported-symbols', { token: 'tk' });
  });

  it('createStrategy should POST with symbols and optional subAccountId', async () => {
    await perps.createStrategy('tk', { symbols: ['BTC', 'ETH'], subAccountId: 'sub1' });
    expect(mockPost).toHaveBeenCalledWith('/v1/fully-managed/create-strategy', {
      token: 'tk', body: { symbols: ['BTC', 'ETH'], subAccountId: 'sub1' },
    });
  });

  it('createStrategy should POST without subAccountId for default wallet', async () => {
    await perps.createStrategy('tk', { symbols: ['BTC'] });
    expect(mockPost).toHaveBeenCalledWith('/v1/fully-managed/create-strategy', {
      token: 'tk', body: { symbols: ['BTC'] },
    });
  });

  it('enableStrategy should POST with strategyId', async () => {
    await perps.enableStrategy('tk', 'strat1');
    expect(mockPost).toHaveBeenCalledWith('/v1/fully-managed/enable-strategy', {
      token: 'tk', body: { strategyId: 'strat1' },
    });
  });

  it('disableStrategy should POST with strategyId', async () => {
    await perps.disableStrategy('tk', 'strat1');
    expect(mockPost).toHaveBeenCalledWith('/v1/fully-managed/disable-strategy', {
      token: 'tk', body: { strategyId: 'strat1' },
    });
  });

  it('updateStrategy should POST with strategyId and symbols', async () => {
    await perps.updateStrategy('tk', { strategyId: 'strat1', symbols: ['SOL'] });
    expect(mockPost).toHaveBeenCalledWith('/v1/fully-managed/update-strategy', {
      token: 'tk', body: { strategyId: 'strat1', symbols: ['SOL'] },
    });
  });

  it('getPerformanceMetrics should GET /v1/fully-managed/performance/metrics/v2', async () => {
    await perps.getPerformanceMetrics('tk');
    expect(mockGet).toHaveBeenCalledWith('/v1/fully-managed/performance/metrics/v2', { token: 'tk' });
  });
});
