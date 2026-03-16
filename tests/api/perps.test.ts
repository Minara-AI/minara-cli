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

  it('modifyOrders should POST /v1/tx/perps/modify-orders', async () => {
    await perps.modifyOrders('tk', { cancels: [{ oid: 1 }] });
    expect(mockPost).toHaveBeenCalledWith('/v1/tx/perps/modify-orders', {
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

  it('getDecisions should GET /v1/tx/perps/decisions/all', async () => {
    await perps.getDecisions('tk');
    expect(mockGet).toHaveBeenCalledWith('/v1/tx/perps/decisions/all', { token: 'tk' });
  });

  it('claimRewards should POST /v1/tx/perps/claim-rewards', async () => {
    await perps.claimRewards('tk');
    expect(mockPost).toHaveBeenCalledWith('/v1/tx/perps/claim-rewards', { token: 'tk' });
  });

  it('getPerpsAddress should GET /auth/me and return perpetual-evm wallet', async () => {
    mockGet.mockResolvedValueOnce({
      success: true,
      data: { wallets: { 'perpetual-evm': '0xPerpAddr123' } },
    } as Awaited<ReturnType<typeof get>>);
    const addr = await perps.getPerpsAddress('tk');
    expect(mockGet).toHaveBeenCalledWith('/auth/me', { token: 'tk' });
    expect(addr).toBe('0xPerpAddr123');
  });

  it('getPerpsAddress should return null when no perp wallet', async () => {
    mockGet.mockResolvedValueOnce({ success: true, data: {} } as Awaited<ReturnType<typeof get>>);
    const addr = await perps.getPerpsAddress('tk');
    expect(addr).toBeNull();
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

  it('getMinEquityValue should GET /v1/fully-managed/get-min-equity-value', async () => {
    await perps.getMinEquityValue('tk');
    expect(mockGet).toHaveBeenCalledWith('/v1/fully-managed/get-min-equity-value', { token: 'tk' });
  });

  it('setMinEquityValue should POST /v1/fully-managed/set-min-equity-value', async () => {
    const dto = { minEquityValue: 100 };
    await perps.setMinEquityValue('tk', dto);
    expect(mockPost).toHaveBeenCalledWith('/v1/fully-managed/set-min-equity-value', {
      token: 'tk', body: dto,
    });
  });

  it('getRecords should GET /v1/fully-managed/records with page and limit', async () => {
    await perps.getRecords('tk', 1, 20);
    expect(mockGet).toHaveBeenCalledWith('/v1/fully-managed/records', {
      token: 'tk', query: { page: 1, limit: 20 },
    });
  });

  it('priceAnalysis should POST /tokens/price-analysis', async () => {
    const dto = { symbol: 'ETH', startTime: 1700000000000 };
    await perps.priceAnalysis('tk', dto);
    expect(mockPost).toHaveBeenCalledWith('/tokens/price-analysis', {
      token: 'tk', body: dto,
    });
  });
});

// ── Hyperliquid direct API (fetch) ───────────────────────────────────────

describe('Hyperliquid API', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  it('getAssetMeta should POST to Hyperliquid info with metaAndAssetCtxs', async () => {
    mockFetch.mockResolvedValueOnce({
      json: vi.fn().mockResolvedValue([
        { universe: [{ name: 'ETH', maxLeverage: 50, szDecimals: 4 }] },
        [{ markPx: '2500' }],
      ]),
    });
    const result = await perps.getAssetMeta();
    expect(mockFetch).toHaveBeenCalledWith('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });
    expect(result).toEqual([{ name: 'ETH', maxLeverage: 50, szDecimals: 4, markPx: 2500 }]);
  });

  it('getOpenOrders should POST to Hyperliquid info with openOrders and user', async () => {
    mockFetch.mockResolvedValueOnce({
      json: vi.fn().mockResolvedValue([
        { coin: 'ETH', limitPx: '2500', oid: 1, side: 'B', sz: '0.1', timestamp: 1700000000 },
      ]),
    });
    const result = await perps.getOpenOrders('0xUserAddr');
    expect(mockFetch).toHaveBeenCalledWith('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'openOrders', user: '0xUserAddr' }),
    });
    expect(result).toHaveLength(1);
    expect(result[0].coin).toBe('ETH');
    expect(result[0].oid).toBe(1);
  });

  it('getUserFills should POST to Hyperliquid info with userFillsByTime', async () => {
    mockFetch.mockResolvedValueOnce({
      json: vi.fn().mockResolvedValue([
        { coin: 'ETH', px: '2500', sz: '0.1', side: 'B', time: 1700000000, dir: 'Open Long', closedPnl: '0', fee: '0.1', oid: 1, tid: 1 },
      ]),
    });
    const result = await perps.getUserFills('0xUserAddr', 7);
    expect(mockFetch).toHaveBeenCalledWith('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.any(String),
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ type: 'userFillsByTime', user: '0xUserAddr', aggregateByTime: true });
    expect(typeof body.startTime).toBe('number');
    expect(result).toHaveLength(1);
    expect(result[0].coin).toBe('ETH');
  });

  it('getUserLeverage should POST to Hyperliquid info with clearinghouseState', async () => {
    mockFetch.mockResolvedValueOnce({
      json: vi.fn().mockResolvedValue({
        assetPositions: [
          {
            position: {
              coin: 'ETH',
              leverage: { type: 'cross', value: 10 },
              maxLeverage: 50,
            },
          },
        ],
      }),
    });
    const result = await perps.getUserLeverage('0xUserAddr');
    expect(mockFetch).toHaveBeenCalledWith('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clearinghouseState', user: '0xUserAddr' }),
    });
    expect(result).toEqual([{ coin: 'ETH', leverageType: 'cross', leverageValue: 10, maxLeverage: 50 }]);
  });
});
