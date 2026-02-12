import { get, post, patch, del } from './client.js';
import type { CreateCopyTradeDto, UpdateCopyTradeDto, CopyTradeInfo } from '../types.js';

/** Create copy trade */
export function createCopyTrade(token: string, dto: CreateCopyTradeDto) {
  return post<CopyTradeInfo>('/copy-trade', { token, body: dto });
}

/** List user's copy trades */
export function listCopyTrades(token: string) {
  return get<CopyTradeInfo[]>('/copy-trade', { token });
}

/** Get copy trade by ID */
export function getCopyTrade(token: string, id: string) {
  return get<CopyTradeInfo>(`/copy-trade/${encodeURIComponent(id)}`, { token });
}

/** Update copy trade */
export function updateCopyTrade(token: string, id: string, dto: UpdateCopyTradeDto) {
  return patch<CopyTradeInfo>(`/copy-trade/${encodeURIComponent(id)}`, { token, body: dto });
}

/** Delete copy trade */
export function deleteCopyTrade(token: string, id: string) {
  return del<void>(`/copy-trade/${encodeURIComponent(id)}`, { token });
}

/** Start copy trade */
export function startCopyTrade(token: string, id: string) {
  return patch<void>(`/copy-trade/${encodeURIComponent(id)}/start`, { token });
}

/** Stop copy trade */
export function stopCopyTrade(token: string, id: string) {
  return patch<void>(`/copy-trade/${encodeURIComponent(id)}/stop`, { token });
}

/** Get copy trade activity */
export function getCopyTradeActivity(token: string, id: string) {
  return get<Record<string, unknown>[]>(`/copy-trade/${encodeURIComponent(id)}/activity`, { token });
}

/** Get copy trade PnL chart */
export function getCopyTradePnl(token: string, id: string) {
  return get<Record<string, unknown>>(`/copy-trade/${encodeURIComponent(id)}/pnl/chart`, { token });
}
