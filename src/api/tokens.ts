import { get } from './client.js';

/** Get trending tokens */
export function getTrendingTokens() {
  return get<unknown>('/tokens/trending-tokens');
}

/** Search tokens by keyword */
export function searchTokens(keyword: string) {
  return get<unknown>('/tokens/search-tokens', { query: { keyword } });
}

/** Get project info for a token */
export function getProjectInfo(symbol: string, address: string) {
  return get<unknown>('/tokens/project-info', { query: { symbol, address } });
}

/** Get trending stocks */
export function getTrendingStocks() {
  return get<unknown>('/stocks/trending-stocks');
}

/** Search stocks */
export function searchStocks(keyword: string) {
  return get<unknown>('/stocks/search-stocks', { query: { keyword } });
}

/** Get stock info */
export function getStockInfo(symbol: string) {
  return get<unknown>('/stocks/get-stock-info', { query: { symbol } });
}

/** Discover tokens by risk preference */
export function discoverTokens(riskPreference: string) {
  return get<unknown>('/discover/tokens', { query: { riskPreference } });
}

/** Get events */
export function getEvents(page: string, pageSize: string, version: string, language: string) {
  return get<unknown>('/discover/events', { query: { page, pageSize, version, language } });
}

/** Get fear & greed index */
export function getFearGreedIndex() {
  return get<unknown>('/discover/fear-greed-index');
}

/** Get bitcoin metrics */
export function getBitcoinMetrics() {
  return get<unknown>('/discover/bitcoin-metrics');
}
