import { get } from './client.js';
import type { TokenInfo } from '../types.js';

/** Get trending tokens */
export function getTrendingTokens() {
  return get<TokenInfo[]>('/tokens/trending-tokens');
}

/** Search tokens by keyword */
export function searchTokens(keyword: string) {
  return get<TokenInfo[]>('/tokens/search-tokens', { query: { keyword } });
}

/** Get project info for a token */
export function getProjectInfo(symbol: string, address: string) {
  return get<Record<string, unknown>>('/tokens/project-info', { query: { symbol, address } });
}

/** Get trending stocks */
export function getTrendingStocks() {
  return get<Record<string, unknown>[]>('/stocks/trending-stocks');
}

/** Search stocks */
export function searchStocks(keyword: string) {
  return get<Record<string, unknown>[]>('/stocks/search-stocks', { query: { keyword } });
}

/** Get stock info */
export function getStockInfo(symbol: string) {
  return get<Record<string, unknown>>('/stocks/get-stock-info', { query: { symbol } });
}

/** Discover tokens by risk preference */
export function discoverTokens(riskPreference: string) {
  return get<TokenInfo[]>('/discover/tokens', { query: { riskPreference } });
}

/** Get events */
export function getEvents(page: string, pageSize: string, version: string, language: string) {
  return get<Record<string, unknown>[]>('/discover/events', { query: { page, pageSize, version, language } });
}

/** Get fear & greed index */
export function getFearGreedIndex() {
  return get<Record<string, unknown>>('/discover/fear-greed-index');
}

/** Get bitcoin metrics */
export function getBitcoinMetrics() {
  return get<Record<string, unknown>>('/discover/bitcoin-metrics');
}

/** Get ethereum metrics */
export function getEthereumMetrics() {
  return get<Record<string, unknown>>('/discover/ethereum-metrics');
}

/** Get solana metrics */
export function getSolanaMetrics() {
  return get<Record<string, unknown>>('/discover/solana-metrics');
}
