import { get, post, patch, del } from './client.js';
import type { CreateLimitOrderDto, UpdateLimitOrderDto, LimitOrderInfo } from '../types.js';

/** Create a limit order */
export function createLimitOrder(token: string, dto: CreateLimitOrderDto) {
  return post<LimitOrderInfo>('/limit-order', { token, body: dto });
}

/** List user's limit orders */
export function listLimitOrders(token: string) {
  return get<LimitOrderInfo[]>('/limit-order', { token });
}

/** Get limit order by ID */
export function getLimitOrder(token: string, id: string) {
  return get<LimitOrderInfo>(`/limit-order/${encodeURIComponent(id)}`, { token });
}

/** Update limit order */
export function updateLimitOrder(token: string, id: string, dto: UpdateLimitOrderDto) {
  return patch<LimitOrderInfo>(`/limit-order/${encodeURIComponent(id)}`, { token, body: dto });
}

/** Delete limit order */
export function deleteLimitOrder(token: string, id: string) {
  return del<void>(`/limit-order/${encodeURIComponent(id)}`, { token });
}

/** Cancel limit order */
export function cancelLimitOrder(token: string, id: string) {
  return post<void>(`/limit-order/${encodeURIComponent(id)}/cancel`, { token });
}
