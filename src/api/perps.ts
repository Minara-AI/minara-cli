import { get, post } from './client.js';
import type { PerpsDepositDto, PerpsWithdrawDto, PerpsPlaceOrdersDto, PerpsCancelOrdersDto, UpdateLeverageDto } from '../types.js';

/** Deposit USDC to perps (min 5 USDC) */
export function deposit(token: string, dto: PerpsDepositDto) {
  return post<unknown>('/v1/tx/perps/deposit', { token, body: dto });
}

/** Withdraw USDC from perps */
export function withdraw(token: string, dto: PerpsWithdrawDto) {
  return post<unknown>('/v1/tx/perps/withdraw', { token, body: dto });
}

/** Place perp orders */
export function placeOrders(token: string, dto: PerpsPlaceOrdersDto) {
  return post<unknown>('/v1/tx/perps/place-orders', { token, body: dto });
}

/** Cancel perp orders */
export function cancelOrders(token: string, dto: PerpsCancelOrdersDto) {
  return post<unknown>('/v1/tx/perps/cancel-orders', { token, body: dto });
}

/** Modify existing orders */
export function modifyOrders(token: string, dto: PerpsCancelOrdersDto) {
  return post<unknown>('/v1/tx/perps/modify-orders', { token, body: dto });
}

/** Update leverage */
export function updateLeverage(token: string, dto: UpdateLeverageDto) {
  return post<unknown>('/v1/tx/perps/update-leverage', { token, body: dto });
}

/** Get all positions */
export function getPositions(token: string) {
  return get<unknown>('/v1/tx/perps/positions/all', { token });
}

/** Get completed trades */
export function getCompletedTrades(token: string) {
  return get<unknown>('/v1/tx/perps/completed-trades/all', { token });
}

/** Get token prices */
export function getTokenPrices(token: string) {
  return get<unknown>('/v1/tx/perps/token/prices', { token });
}

/** Get fund records */
export function getFundRecords(token: string, page: number, limit: number) {
  return get<unknown>('/v1/tx/perps/fund-records', { token, query: { page, limit } });
}

/** Get equity history chart */
export function getEquityHistory(token: string) {
  return get<unknown>('/v1/tx/perps/equity-history-chart/all', { token });
}

/** Get all decisions */
export function getDecisions(token: string) {
  return get<unknown>('/v1/tx/perps/decisions/all', { token });
}

/** Claim rewards */
export function claimRewards(token: string) {
  return post<unknown>('/v1/tx/perps/claim-rewards', { token });
}
