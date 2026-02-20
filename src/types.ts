// ═══════════════════════════════════════════════════════════════════════════
//  Types aligned with xneuro-core OpenAPI spec
// ═══════════════════════════════════════════════════════════════════════════

// ─── Chains ──────────────────────────────────────────────────────────────

export const SUPPORTED_CHAINS = [
  'ethereum', 'base', 'arbitrum', 'optimism', 'polygon', 'avalanche',
  'solana', 'bsc', 'berachain', 'blast', 'manta', 'mode', 'sonic',
  'conflux', 'merlin', 'monad', 'polymarket', 'xlayer',
] as const;
export type Chain = (typeof SUPPORTED_CHAINS)[number];

// ─── Auth ────────────────────────────────────────────────────────────────

export interface Credentials {
  accessToken: string;
  userId?: string;
  email?: string;
  displayName?: string;
}

export interface EmailCodeDto {
  email: string;
  captchaToken?: string;
  platform?: string;
  emailType?: string;
}

export interface EmailVerifyDto {
  email: string;
  code: string;
  kolReferral?: string;
  inviteCode?: string;
  deviceId?: string;
  deviceType?: string;
  channel?: string;
}

export interface AuthUser {
  id: string;
  username?: string;
  email?: string;
  displayName?: string;
  avatar?: string;
  access_token?: string;
  wallets?: Record<string, string>;
  accounts?: Record<string, unknown>;
  invitationCode?: string;
  mfaSettings?: Record<string, unknown>;
}

// ─── Device Authorization Flow (RFC 8628) ─────────────────────────────────

export interface DeviceAuthStartResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

export interface DeviceAuthStatusResponse {
  status: 'pending' | 'completed' | 'expired';
  access_token?: string;
  user?: AuthUser;
}

export interface FavoriteTokensPayload {
  tokens: string[];
}

// ─── OAuth ──────────────────────────────────────────────────────────────

export type OAuthProvider = 'google' | 'apple';

export const OAUTH_PROVIDERS: { name: string; value: OAuthProvider }[] = [
  { name: 'Google',   value: 'google' },
  { name: 'Apple ID', value: 'apple' },
];

// ─── Chat ────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ChatContentPart[];
  id?: string;
}

export interface ChatContentPart {
  type: 'text' | 'image';
  text?: string;
  image?: string;
  mimeType?: string;
}

export interface ChatRequestDTO {
  chatId?: string;
  parentMessageId?: string;
  thinking?: boolean;
  deepresearch?: boolean;
  workMode?: string;
  platform?: string;
  message: {
    role: string;
    content: string | ChatContentPart[];
    id?: string;
  };
  chartOptions?: { chartsCountRecommendedLimit?: number };
  userTimezone?: string;
}

export interface ChatInfo {
  chatId: string;
  name?: string;
  firstMessage?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChatMemory {
  id: string;
  role: 'user' | 'assistant';
  content: string | Record<string, unknown>;
  parentMessageId?: string;
  createdAt: string;
}

// ─── CrossChain Assets ──────────────────────────────────────────────────

export interface WalletAsset {
  symbol?: string;
  tokenSymbol?: string;
  balance?: string;
  amount?: string;
  chain?: string;
  chainName?: string;
  tokenAddress?: string;
  usdValue?: string;
}

export interface CrossChainAccount {
  [key: string]: unknown;
}

export interface TransactionResult {
  transactionId?: string;
  status?: string;
  [key: string]: unknown;
}

// ─── CrossChain (Spot Trading) ───────────────────────────────────────────

export type SwapSide = 'buy' | 'sell';

export interface CrossChainSwapDto {
  chain: Chain;
  side: SwapSide;
  tokenAddress: string;
  buyUsdAmountOrSellTokenAmount: string;
  chatId?: string;
  toolCallIds?: string[];
  toolCallIndexes?: string[];
}

export interface CrossChainTransferDto {
  chain: Chain;
  tokenAddress: string;
  tokenAmount: string;
  recipient: string;
  chatId?: string;
  toolCallIds?: string[];
  toolCallIndexes?: string[];
}

export interface CrossChainActivitiesDto {
  limit: number;
  page: number;
  filter?: {
    chainId?: number;
    tokenAddress?: string;
    tags?: string[];
  };
}

// ─── HyperliquidPerps ────────────────────────────────────────────────────

export interface PerpsDepositDto {
  usdcAmount: number; // min 5 USDC
}

export interface PerpsWithdrawDto {
  usdcAmount: number;
  toAddress: string;
}

export interface PerpsOrder {
  /** asset symbol */
  a: string;
  /** isBuy */
  b: boolean;
  /** limitPx / triggerPx */
  p: string;
  /** size */
  s: string;
  /** reduceOnly */
  r: boolean;
  /** order type: limit or trigger */
  t: { limit: { tif: string } } | { trigger: { triggerPx: string; tpsl: string; isMarket: boolean } };
}

export interface PerpsPlaceOrdersDto {
  orders: PerpsOrder[];
  grouping: 'na' | 'normalTpsl' | 'positionTpsl';
  expiresAfter?: number;
}

export interface PerpsCancelEntry {
  /** asset symbol */
  a: string;
  /** order id */
  o: number;
}

export interface PerpsCancelOrdersDto {
  cancels: PerpsCancelEntry[];
}

export interface PerpsPosition {
  symbol?: string;
  side?: string;
  size?: string;
  entryPrice?: string;
  markPrice?: string;
  pnl?: string;
  leverage?: number;
  [key: string]: unknown;
}

export interface TokenPrice {
  symbol?: string;
  price?: number;
  [key: string]: unknown;
}

export interface UpdateLeverageDto {
  symbol: string;
  isCross: boolean;
  leverage: number;
}

// ─── Limit Orders ────────────────────────────────────────────────────────

export interface CreateLimitOrderDto {
  priceCondition: string;  // 'above' | 'below'
  targetPrice: number;
  targetTokenCA: string;
  expiredAt: number;       // timestamp in seconds
  chain: string;
  side: string;
  amount: string;
  inputTokenSymbol?: string;
  inputTokenCA?: string;
  outputTokenSymbol?: string;
  outputTokenCA?: string;
  inputTokenAmount?: string;
  inputTokenPercentage?: number;
  targetToken?: string;
  startAt?: number;
  once?: boolean;
}

export interface LimitOrderInfo {
  id: string;
  chain: string;
  side: string;
  amount: string;
  priceCondition: string;
  targetPrice: number;
  targetTokenCA: string;
  inputTokenSymbol?: string;
  outputTokenSymbol?: string;
  status?: string;
  createdAt?: string;
  expiredAt?: number;
}

export interface UpdateLimitOrderDto {
  status?: string;
  side?: string;
  amount?: string;
  priceCondition?: string;
  targetPrice?: number;
  expiredAt?: number;
}

// ─── Copy Trade ──────────────────────────────────────────────────────────

export interface CreateCopyTradeDto {
  targetAddress: string;
  chain: string;
  name?: string;
  mode?: 'fixedAmount';
  copySell?: boolean;
  copySellSamePercentage?: boolean;
  copySellQuitPercentage?: number;
  fixedAmount?: number;
  status?: 'running' | 'paused';
  expiredAt?: number;
}

export interface CopyTradeInfo {
  id: string;
  name?: string;
  targetAddress: string;
  chain: string;
  mode?: string;
  fixedAmount?: number;
  copySell?: boolean;
  status?: string;
  createdAt?: string;
}

export interface UpdateCopyTradeDto {
  chain: string;
  name?: string;
  mode?: 'fixedAmount';
  copySell?: boolean;
  copySellSamePercentage?: boolean;
  copySellQuitPercentage?: number;
  fixedAmount?: number;
  targetAddress?: string;
  status?: 'running' | 'paused';
  expiredAt?: number;
}

// ─── User Trade Config ───────────────────────────────────────────────────

export interface UserTradeConfig {
  slippage?: string;
  priorityFee?: string;
  tip?: string;
  mode?: 'FAST' | 'ANTI_MEV';
}

// ─── Tokens / Stocks ─────────────────────────────────────────────────────

export interface TokenInfo {
  symbol: string;
  name?: string;
  address?: string;
  chain?: string;
  price?: number;
  change24h?: number;
  marketCap?: number;
}

// ─── Discover ────────────────────────────────────────────────────────────

export interface DiscoverEvent {
  id: string;
  title?: string;
  slug?: string;
  content?: string;
  createdAt?: string;
}

// ─── Payment / Subscription ──────────────────────────────────────────────

export interface PaymentPlan {
  id: string;
  name?: string;
  price?: number;
  currency?: string;
  interval?: string;
}

// ─── Gas Fees ────────────────────────────────────────────────────────────

export interface GasFeeInfo {
  chain?: string;
  fee?: string;
  [key: string]: unknown;
}

// ─── API generic ─────────────────────────────────────────────────────────

export interface ApiError {
  code: number;
  message: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}
