import { get, post } from './client.js';
import type {
  PerpsDepositDto,
  PerpsWithdrawDto,
  PerpsPlaceOrdersDto,
  PerpsCancelOrdersDto,
  UpdateLeverageDto,
  PerpsPosition,
  TokenPrice,
  TransactionResult,
} from '../types.js';

/** Deposit USDC to perps (min 5 USDC) */
export function deposit(token: string, dto: PerpsDepositDto) {
  return post<TransactionResult>('/v1/tx/perps/deposit', { token, body: dto });
}

/** Withdraw USDC from perps */
export function withdraw(token: string, dto: PerpsWithdrawDto) {
  return post<TransactionResult>('/v1/tx/perps/withdraw', { token, body: dto });
}

/** Place perp orders */
export function placeOrders(token: string, dto: PerpsPlaceOrdersDto) {
  return post<TransactionResult>('/v1/tx/perps/place-orders', { token, body: dto });
}

/** Cancel perp orders */
export function cancelOrders(token: string, dto: PerpsCancelOrdersDto) {
  return post<TransactionResult>('/v1/tx/perps/cancel-orders', { token, body: dto });
}

/** Modify existing orders */
export function modifyOrders(token: string, dto: PerpsCancelOrdersDto) {
  return post<TransactionResult>('/v1/tx/perps/modify-orders', { token, body: dto });
}

/** Update leverage */
export function updateLeverage(token: string, dto: UpdateLeverageDto) {
  return post<void>('/v1/tx/perps/update-leverage', { token, body: dto });
}

/** Get all positions */
export function getPositions(token: string) {
  return get<PerpsPosition[]>('/v1/tx/perps/positions/all', { token });
}

/** Get completed trades */
export function getCompletedTrades(token: string) {
  return get<Record<string, unknown>[]>('/v1/tx/perps/completed-trades/all', { token });
}

/** Get token prices */
export function getTokenPrices(token: string) {
  return get<TokenPrice[]>('/v1/tx/perps/token/prices', { token });
}

/** Get fund records */
export function getFundRecords(token: string, page: number, limit: number) {
  return get<Record<string, unknown>[]>('/v1/tx/perps/fund-records', { token, query: { page, limit } });
}

/** Get equity history chart */
export function getEquityHistory(token: string) {
  return get<Record<string, unknown>>('/v1/tx/perps/equity-history-chart/all', { token });
}

/** Get perps account summary (balance, equity, positions, PnL) */
export function getAccountSummary(token: string) {
  return get<Record<string, unknown>>('/v1/fully-managed/account-summary', { token });
}

/** Get all decisions */
export function getDecisions(token: string) {
  return get<Record<string, unknown>[]>('/v1/tx/perps/decisions/all', { token });
}

/** Claim rewards */
export function claimRewards(token: string) {
  return post<TransactionResult>('/v1/tx/perps/claim-rewards', { token });
}

// ── Autopilot (Fully Managed Strategy) ───────────────────────────────────

export function getStrategies(token: string) {
  return get<Record<string, unknown>[]>('/v1/fully-managed/strategies', { token });
}

export function getSupportedSymbols(token: string) {
  return get<string[]>('/v1/fully-managed/supported-symbols', { token });
}

export function createStrategy(token: string, dto: { symbols: string[]; strategyConfig?: Record<string, unknown>; language?: string }) {
  return post<Record<string, unknown>>('/v1/fully-managed/create-strategy', { token, body: dto });
}

export function enableStrategy(token: string, strategyId: string) {
  return post<Record<string, unknown>>('/v1/fully-managed/enable-strategy', { token, body: { strategyId } });
}

export function disableStrategy(token: string, strategyId: string) {
  return post<Record<string, unknown>>('/v1/fully-managed/disable-strategy', { token, body: { strategyId } });
}

export function updateStrategy(token: string, dto: { strategyId: string; symbols: string[]; strategyConfig?: Record<string, unknown>; language?: string }) {
  return post<Record<string, unknown>>('/v1/fully-managed/update-strategy', { token, body: dto });
}

export function getPerformanceMetrics(token: string) {
  return get<Record<string, unknown>>('/v1/fully-managed/performance/metrics/v2', { token });
}

// ── Price Analysis (Ask Long/Short) ──────────────────────────────────────

export function priceAnalysis(token: string, dto: { symbol: string; startTime?: number; endTime?: number; interval?: string; positionUSD?: number; leverage?: number }) {
  return post<Record<string, unknown>>('/tokens/price-analysis', { token, body: dto });
}

/** Get perps wallet address from user profile */
export async function getPerpsAddress(token: string): Promise<string | null> {
  const res = await get<{ wallets?: Record<string, string> }>('/auth/me', { token });
  if (!res.success || !res.data) return null;
  return res.data.wallets?.['perpetual-evm'] ?? null;
}

// ── Hyperliquid public API (no auth) ─────────────────────────────────────

export interface HlAssetMeta {
  name: string;
  maxLeverage: number;
  szDecimals: number;
}

export interface HlAssetInfo extends HlAssetMeta {
  markPx: number;
}

let _assetInfoCache: HlAssetInfo[] | null = null;

/** Fetch perpetuals universe metadata + live prices from Hyperliquid (cached per session). */
export async function getAssetMeta(): Promise<HlAssetInfo[]> {
  if (_assetInfoCache) return _assetInfoCache;
  try {
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });
    const json = (await res.json()) as [
      { universe: HlAssetMeta[] },
      { markPx: string; midPx?: string }[],
    ];
    const [meta, ctxs] = json;
    _assetInfoCache = (meta.universe ?? []).map((m, i) => ({
      ...m,
      markPx: Number(ctxs?.[i]?.markPx ?? 0),
    }));
    return _assetInfoCache;
  } catch {
    return [];
  }
}

export interface HlFill {
  coin: string;
  px: string;
  sz: string;
  side: string;   // 'A' (sell) or 'B' (buy)
  time: number;
  dir: string;     // 'Open Long', 'Close Short', etc.
  closedPnl: string;
  fee: string;
  oid: number;
  tid: number;
}

/** Fetch user trade fills directly from Hyperliquid (last 7 days by default). */
export async function getUserFills(address: string, days = 7): Promise<HlFill[]> {
  try {
    const startTime = Date.now() - days * 24 * 60 * 60 * 1000;
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'userFillsByTime',
        user: address,
        startTime,
        aggregateByTime: true,
      }),
    });
    const data = await res.json();
    return Array.isArray(data) ? data as HlFill[] : [];
  } catch {
    return [];
  }
}

export interface HlLeverageInfo {
  coin: string;
  leverageType: string;
  leverageValue: number;
  maxLeverage: number;
}

/** Fetch user's per-asset leverage from Hyperliquid clearinghouseState. */
export async function getUserLeverage(address: string): Promise<HlLeverageInfo[]> {
  try {
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clearinghouseState', user: address }),
    });
    const data = (await res.json()) as {
      assetPositions?: {
        position: {
          coin: string;
          leverage: { type: string; value: number };
          maxLeverage: number;
        };
      }[];
    };
    return (data.assetPositions ?? []).map((ap) => ({
      coin: ap.position.coin,
      leverageType: ap.position.leverage.type,
      leverageValue: ap.position.leverage.value,
      maxLeverage: ap.position.maxLeverage,
    }));
  } catch {
    return [];
  }
}
