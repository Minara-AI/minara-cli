import { get, post } from './client.js';
import type {
  CrossChainSwapDto,
  CrossChainTransferDto,
  CrossChainActivitiesDto,
  CrossChainAccount,
  WalletAsset,
  TransactionResult,
} from '../types.js';

/** Get cross-chain account info */
export function getAccount(token: string) {
  return get<CrossChainAccount>('/v1/tx/cross-chain/account', { token });
}

/** Get wallet assets */
export function getAssets(token: string) {
  return get<WalletAsset[]>('/v1/tx/cross-chain/assets', { token });
}

/** Execute a single swap */
export function swap(token: string, dto: CrossChainSwapDto) {
  return post<TransactionResult>('/v1/tx/cross-chain/swap', { token, body: dto });
}

/** Execute multiple swaps */
export function swaps(token: string, swapList: CrossChainSwapDto[]) {
  return post<TransactionResult[]>('/v1/tx/cross-chain/swaps', {
    token,
    body: { swaps: swapList },
  });
}

/** Simulate swaps (dry-run) */
export function swapsSimulate(token: string, swapList: CrossChainSwapDto[]) {
  return post<TransactionResult[]>('/v1/tx/cross-chain/swaps-simulate', {
    token,
    body: { swaps: swapList },
  });
}

/** Transfer tokens */
export function transfer(token: string, dto: CrossChainTransferDto) {
  return post<TransactionResult>('/v1/tx/cross-chain/transfer', { token, body: dto });
}

/** Get activities */
export function getActivities(token: string, dto: CrossChainActivitiesDto) {
  return post<Record<string, unknown>[]>('/v1/tx/cross-chain/activities', { token, body: dto });
}

/** Get PnL history */
export function getPnlHistory(token: string, type: string) {
  return get<Record<string, unknown>>('/v1/tx/cross-chain/pnl/history', { token, query: { type } });
}

/** Check transaction statuses */
export function getStatuses(token: string, transactionIds: string[]) {
  return post<TransactionResult[]>('/v1/tx/cross-chain/statuses', { token, body: { transactionIds } });
}
