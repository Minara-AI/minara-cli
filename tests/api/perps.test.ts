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
