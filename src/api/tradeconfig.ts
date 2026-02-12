import { get, post, del } from './client.js';
import type { UserTradeConfig } from '../types.js';

/** Get user trade config */
export function getTradeConfig(token: string) {
  return get<UserTradeConfig>('/user-trade-config', { token });
}

/** Create or update trade config */
export function upsertTradeConfig(token: string, config: UserTradeConfig) {
  return post<UserTradeConfig>('/user-trade-config', { token, body: config });
}

/** Delete trade config */
export function deleteTradeConfig(token: string) {
  return del<void>('/user-trade-config', { token });
}

import type { GasFeeInfo } from '../types.js';

/** Get gas fees */
export function getGasFees(token: string) {
  return get<GasFeeInfo[]>('/user-trade-config/gas-fees', { token });
}
