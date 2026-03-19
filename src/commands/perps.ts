import { Command } from 'commander';
import { input, select, confirm, number as numberPrompt } from '@inquirer/prompts';
import chalk from 'chalk';
import * as perpsApi from '../api/perps.js';
import { requireAuth } from '../config.js';
import { success, info, warn, spinner, assertApiOk, formatOrderSide, wrapAction, requireTransactionConfirmation, validateAddress } from '../utils.js';
import { requireTouchId } from '../touchid.js';
import { printTxResult, printTable, printKV, POSITION_COLUMNS, FILL_COLUMNS } from '../formatters.js';
import type { PerpsOrder, PerpSubAccount } from '../types.js';

// ─── shared helpers ──────────────────────────────────────────────────────

const WALLET_OPT = ['-w, --wallet <name>', 'Wallet name or ID'] as const;

const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pnlFmt = (n: number) => {
  const color = n >= 0 ? chalk.green : chalk.red;
  return color(`${n >= 0 ? '+' : ''}${fmt(n)}`);
};

function getSubAccountId(w: PerpSubAccount): string {
  return String(w._id ?? w.id ?? w.subAccountId ?? '');
}

function getSubAccountLabel(w: PerpSubAccount): string {
  const name = w.name ?? 'Unnamed';
  const def = w.isDefault ? chalk.dim(' (default)') : '';
  return `${name}${def}`;
}

interface WalletSummary {
  equity: number;
  available: number;
  margin: number;
  unrealizedPnl: number;
  positions: Record<string, unknown>[];
}

/**
 * Normalize the Hyperliquid sub-account summary into a consistent shape.
 * The API returns: { marginSummary: { accountValue, totalNtlPos, totalMarginUsed },
 *   withdrawable, assetPositions, ... }
 * But we also handle the flattened shape used in our PerpSubAccount type as fallback.
 */
function normalizeWalletSummary(raw: Record<string, unknown>): WalletSummary {
  const margin = raw.marginSummary as Record<string, unknown> | undefined;
  if (margin) {
    const rawPositions = Array.isArray(raw.assetPositions)
      ? (raw.assetPositions as Record<string, unknown>[])
      : [];
    const positions = rawPositions.map((ap) => {
      const pos = (ap.position && typeof ap.position === 'object'
        ? ap.position : ap) as Record<string, unknown>;
      return normalizePosition(pos);
    });
    return {
      equity: parseFloat(String(margin.accountValue ?? 0)),
      available: parseFloat(String(raw.withdrawable ?? 0)),
      margin: parseFloat(String(margin.totalMarginUsed ?? 0)),
      unrealizedPnl: parseFloat(String(margin.totalNtlPos ?? 0)),
      positions,
    };
  }
  // Fallback: flattened shape from PerpSubAccount or other responses
  return {
    equity: Number(raw.equityValue ?? raw.accountValue ?? 0),
    available: Number(raw.dispatchableValue ?? raw.withdrawable ?? 0),
    margin: Number(raw.totalMarginUsed ?? 0),
    unrealizedPnl: Number(raw.totalUnrealizedPnl ?? raw.totalNtlPos ?? 0),
    positions: Array.isArray(raw.positions) ? raw.positions as Record<string, unknown>[] : [],
  };
}

/**
 * Normalize a Hyperliquid position object to match our POSITION_COLUMNS keys.
 * HL uses: coin, szi (signed size), entryPx, positionValue, unrealizedPnl,
 *   leverage: { type, value }, liquidationPx, marginUsed, ...
 */
function normalizePosition(pos: Record<string, unknown>): Record<string, unknown> {
  const szi = parseFloat(String(pos.szi ?? pos.size ?? 0));
  const lev = pos.leverage;
  let leverageVal: string | undefined;
  if (lev && typeof lev === 'object') {
    const lo = lev as Record<string, unknown>;
    leverageVal = String(lo.value ?? lo.rawUsd ?? '');
  } else if (lev !== undefined && lev !== null) {
    leverageVal = String(lev);
  }

  return {
    symbol: pos.coin ?? pos.symbol ?? '—',
    side: szi > 0 ? 'Long' : szi < 0 ? 'Short' : (pos.side ?? '—'),
    size: Math.abs(szi) || pos.size || '—',
    entryPrice: pos.entryPx ?? pos.entryPrice,
    positionValue: pos.positionValue,
    unrealizedPnl: pos.unrealizedPnl,
    leverage: leverageVal,
    marginUsed: pos.marginUsed,
    liquidationPx: pos.liquidationPx,
  };
}

async function fetchSubAccounts(token: string): Promise<PerpSubAccount[]> {
  const res = await perpsApi.listSubAccounts(token);
  if (!res.success || !res.data) return [];
  const raw = res.data;
  if (Array.isArray(raw)) return raw as PerpSubAccount[];
  if (raw && typeof raw === 'object') {
    const inner = (raw as Record<string, unknown>).data
      ?? (raw as Record<string, unknown>).subAccounts
      ?? (raw as Record<string, unknown>).wallets;
    if (Array.isArray(inner)) return inner as PerpSubAccount[];
  }
  return [];
}

async function pickSubAccount(token: string, message = 'Select wallet:'): Promise<PerpSubAccount | null> {
  const wallets = await fetchSubAccounts(token);
  if (wallets.length === 0) {
    warn('No perps wallets found.');
    return null;
  }
  if (wallets.length === 1) return wallets[0];

  const summaries = await Promise.all(
    wallets.map((w) => perpsApi.getSubAccountSummary(token, getSubAccountId(w))),
  );

  return select<PerpSubAccount>({
    message,
    choices: wallets.map((w, i) => {
      const raw = summaries[i].success && summaries[i].data
        ? summaries[i].data as Record<string, unknown> : w as Record<string, unknown>;
      const s = normalizeWalletSummary(raw);
      const eq = fmt(s.available);
      const addr = w.address ? chalk.yellow(w.address) : '';
      return {
        name: `${getSubAccountLabel(w)}  ${chalk.dim(eq)}  ${addr ? chalk.dim(addr.slice(0, 10) + '…') : ''}`,
        value: w,
      };
    }),
  });
}

/**
 * Resolve a wallet by name (from --wallet flag) or interactive selection.
 * Returns `{ wallet, walletId }` — walletId is undefined for the default account.
 */
async function resolveWallet(
  token: string,
  walletName?: string,
  message = 'Select wallet:',
): Promise<{ wallet: PerpSubAccount; walletId: string | undefined } | null> {
  const wallets = await fetchSubAccounts(token);
  if (wallets.length === 0) return null;

  let wallet: PerpSubAccount;

  if (walletName) {
    const nameUpper = walletName.toUpperCase();
    const match = wallets.find((w) =>
      (w.name ?? '').toUpperCase() === nameUpper
      || getSubAccountId(w) === walletName
    );
    if (!match) {
      warn(`Wallet "${walletName}" not found. Available: ${wallets.map((w) => w.name ?? getSubAccountId(w)).join(', ')}`);
      return null;
    }
    wallet = match;
  } else if (wallets.length === 1) {
    wallet = wallets[0];
  } else {
    const summaries = await Promise.all(
      wallets.map((w) => perpsApi.getSubAccountSummary(token, getSubAccountId(w))),
    );
    wallet = await select<PerpSubAccount>({
      message,
      choices: wallets.map((w, i) => {
        const raw = summaries[i].success && summaries[i].data
          ? summaries[i].data as Record<string, unknown> : w as Record<string, unknown>;
        const s = normalizeWalletSummary(raw);
        const eq = fmt(s.available);
        return {
          name: `${getSubAccountLabel(w)}  ${chalk.dim(eq)}`,
          value: w,
        };
      }),
    });
  }

  const wId = getSubAccountId(wallet);
  return { wallet, walletId: wallet.isDefault ? undefined : (wId || undefined) };
}

// ─── autopilot helpers ───────────────────────────────────────────────────

interface AutopilotState {
  active: boolean;
  strategyId?: string;
  name?: string;
  symbols?: string[];
  subAccountId?: string;
  strategyConfig?: Record<string, unknown>;
  language?: string;
  createdAt?: string;
  updatedAt?: string;
  raw?: Record<string, unknown>;
}

function parseStrategies(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === 'object') {
    const inner = (raw as Record<string, unknown>).strategies
      ?? (raw as Record<string, unknown>).data
      ?? raw;
    if (Array.isArray(inner)) return inner as Record<string, unknown>[];
    for (const v of Object.values(raw as Record<string, unknown>)) {
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}

function extractStrategyName(s: Record<string, unknown>): string | undefined {
  for (const field of ['name', 'strategyName', 'title', 'label', 'displayName']) {
    if (s[field] && typeof s[field] === 'string') return String(s[field]);
  }
  // Try config-level name
  if (s.strategyConfig && typeof s.strategyConfig === 'object') {
    const cfg = s.strategyConfig as Record<string, unknown>;
    if (cfg.name && typeof cfg.name === 'string') return String(cfg.name);
  }
  // Build a descriptive name from symbols + pattern if available
  const symbols = Array.isArray(s.symbols) ? s.symbols : [];
  const symStr = symbols.length > 0
    ? extractSymbolNames(symbols).join('/')
    : undefined;
  if (symStr && s.pattern !== undefined) return `${symStr} P${s.pattern}`;
  if (symStr) return symStr;
  return undefined;
}

function strategyToState(s: Record<string, unknown>): AutopilotState {
  const status = String(
    s.status ?? s.state ?? s.isActive ?? s.enabled ?? '',
  ).toLowerCase();
  const isActive = status === 'active' || status === 'enabled' || status === 'running'
    || status === 'true' || s.isActive === true || s.enabled === true;

  const symbols = Array.isArray(s.symbols)
    ? (s.symbols as unknown[]).map((sym) => {
      if (typeof sym === 'string') return sym;
      if (sym && typeof sym === 'object') {
        const o = sym as Record<string, unknown>;
        return String(o.symbol ?? o.name ?? o.coin ?? sym);
      }
      return String(sym);
    })
    : [];

  return {
    active: isActive,
    strategyId: String(s._id ?? s.id ?? s.strategyId ?? ''),
    name: extractStrategyName(s),
    symbols,
    subAccountId: s.subAccountId ? String(s.subAccountId) : undefined,
    strategyConfig: s.strategyConfig && typeof s.strategyConfig === 'object'
      ? s.strategyConfig as Record<string, unknown> : undefined,
    language: s.language ? String(s.language) : undefined,
    createdAt: s.createdAt ? String(s.createdAt) : undefined,
    updatedAt: s.updatedAt ? String(s.updatedAt) : undefined,
    raw: s,
  };
}

async function getAutopilotState(token: string): Promise<AutopilotState> {
  const res = await perpsApi.getStrategies(token);
  if (!res.success || !res.data) return { active: false };
  const strategies = parseStrategies(res.data);
  if (strategies.length === 0) return { active: false };
  return strategyToState(strategies[0]);
}

async function getAllAutopilotStates(token: string): Promise<AutopilotState[]> {
  const res = await perpsApi.getStrategies(token);
  if (!res.success || !res.data) return [];
  return parseStrategies(res.data).map(strategyToState);
}

function getAutopilotForSubAccount(states: AutopilotState[], subAccountId: string): AutopilotState | undefined {
  return states.find((s) => s.subAccountId === subAccountId);
}

function getAllStrategiesForWallet(states: AutopilotState[], walletId: string, isDefault: boolean): AutopilotState[] {
  return states.filter((s) => {
    if (s.subAccountId === walletId) return true;
    if (isDefault && !s.subAccountId) return true;
    return false;
  });
}

function strategyDisplayName(s: AutopilotState): string {
  if (s.name) return s.name;
  if (s.strategyId) return s.strategyId.length > 12 ? s.strategyId.slice(0, 12) + '…' : s.strategyId;
  return 'Unnamed';
}

/** Normalize supported-symbols response: handles string[], object[] with symbol/name key, or nested structures. */
function extractSymbolNames(data: unknown): string[] {
  const fallback = ['BTC', 'ETH', 'SOL'];
  if (!data) return fallback;

  const arr = Array.isArray(data) ? data : [];
  if (arr.length === 0) return fallback;

  return arr.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const name = obj.symbol ?? obj.name ?? obj.coin ?? obj.asset ?? obj.ticker;
      if (typeof name === 'string') return name;
    }
    return String(item);
  });
}

// ─── deposit ─────────────────────────────────────────────────────────────

const depositCmd = new Command('deposit')
  .description('Deposit USDC into Hyperliquid perps (min 5 USDC)')
  .option('-a, --amount <amount>', 'USDC amount')
  .option(WALLET_OPT[0], WALLET_OPT[1])
  .option('-y, --yes', 'Skip confirmation')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    const resolved = await resolveWallet(creds.accessToken, opts.wallet, 'Deposit to which wallet?');
    if (!resolved) return;
    const { wallet, walletId } = resolved;

    const amount = opts.amount
      ? parseFloat(opts.amount)
      : await numberPrompt({ message: 'USDC amount to deposit (min 5):', min: 5, required: true });

    if (!amount || amount < 5) {
      console.error(chalk.red('✖'), 'Minimum deposit is 5 USDC');
      process.exit(1);
    }

    console.log(`\n  Deposit : ${chalk.bold(amount)} USDC → ${getSubAccountLabel(wallet)}\n`);
    if (!opts.yes) {
      const ok = await confirm({ message: 'Confirm deposit?', default: true });
      if (!ok) return;
    }

    await requireTransactionConfirmation(`Deposit ${amount} USDC → ${wallet.name ?? 'Perps'}`);
    await requireTouchId();

    const spin = spinner('Depositing…');
    const res = await perpsApi.deposit(creds.accessToken, { usdcAmount: amount, subAccountId: walletId });
    spin.stop();
    assertApiOk(res, 'Deposit failed');
    success(`Deposited ${amount} USDC to ${getSubAccountLabel(wallet)}`);
    printTxResult(res.data);
  }));

// ─── withdraw ────────────────────────────────────────────────────────────

const withdrawCmd = new Command('withdraw')
  .description('Withdraw USDC from Hyperliquid perps')
  .option('-a, --amount <amount>', 'USDC amount')
  .option('--to <address>', 'Destination address')
  .option(WALLET_OPT[0], WALLET_OPT[1])
  .option('-y, --yes', 'Skip confirmation')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    const resolved = await resolveWallet(creds.accessToken, opts.wallet, 'Withdraw from which wallet?');
    if (!resolved) return;
    const { wallet, walletId } = resolved;

    const amount = opts.amount
      ? parseFloat(opts.amount)
      : await numberPrompt({ message: 'USDC amount to withdraw:', min: 0.01, required: true });

    const toAddress: string = opts.to ?? await input({
      message: 'Destination address:',
      validate: (v) => validateAddress(v, 'arbitrum'),
    });

    console.log(`\n  Withdraw : ${chalk.bold(amount)} USDC from ${getSubAccountLabel(wallet)} → ${chalk.yellow(toAddress)}\n`);
    warn('Withdrawals may take time to process.');
    if (!opts.yes) {
      const ok = await confirm({ message: 'Confirm withdrawal?', default: false });
      if (!ok) return;
    }

    await requireTransactionConfirmation(`Withdraw ${amount} USDC → ${toAddress}`);
    await requireTouchId();

    const spin = spinner('Withdrawing…');
    const res = await perpsApi.withdraw(creds.accessToken, { usdcAmount: amount!, toAddress, subAccountId: walletId });
    spin.stop();
    assertApiOk(res, 'Withdrawal failed');
    success('Withdrawal submitted');
    printTxResult(res.data);
  }));

// ─── positions ───────────────────────────────────────────────────────────

const positionsCmd = new Command('positions')
  .alias('pos')
  .description('View open perps positions')
  .option(WALLET_OPT[0], WALLET_OPT[1])
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    // If --wallet specified, show only that wallet
    if (opts.wallet) {
      const resolved = await resolveWallet(creds.accessToken, opts.wallet, 'View positions for which wallet?');
      if (!resolved) return;
      const { wallet, walletId } = resolved;
      const wId = walletId ?? getSubAccountId(wallet);

      const spin = spinner(`Fetching ${wallet.name ?? 'wallet'}…`);
      const sumRes = await perpsApi.getSubAccountSummary(creds.accessToken, wId);
      spin.stop();

      const raw = sumRes.success && sumRes.data ? sumRes.data as Record<string, unknown> : wallet as Record<string, unknown>;
      const s = normalizeWalletSummary(raw);
      console.log('');
      console.log(chalk.bold(`${getSubAccountLabel(wallet)}:`));
      console.log(`  Equity        : ${fmt(s.equity)}`);
      console.log(`  Unrealized PnL: ${pnlFmt(s.unrealizedPnl)}`);
      console.log(`  Margin Used   : ${fmt(s.margin)}`);

      console.log('');
      console.log(chalk.bold(`Open Positions (${s.positions.length}):`));
      if (s.positions.length === 0) {
        console.log(chalk.dim('  No open positions.'));
      } else {
        printTable(s.positions as object[], POSITION_COLUMNS);
      }
      console.log('');
      return;
    }

    // No --wallet: show all wallets
    const spin = spinner('Fetching wallets…');
    const wallets = await fetchSubAccounts(creds.accessToken);
    spin.stop();

    if (wallets.length === 0) {
      // Fallback to legacy single-wallet API
      const legSpin = spinner('Fetching positions…');
      const res = await perpsApi.getAccountSummary(creds.accessToken);
      legSpin.stop();

      if (!res.success || !res.data) {
        console.log(chalk.dim('Could not fetch positions.'));
        return;
      }

      const s = normalizeWalletSummary(res.data as Record<string, unknown>);
      console.log('');
      console.log(`  Equity        : ${fmt(s.equity)}`);
      console.log(`  Unrealized PnL: ${pnlFmt(s.unrealizedPnl)}`);
      console.log(`  Margin Used   : ${fmt(s.margin)}`);

      console.log('');
      console.log(chalk.bold(`Open Positions (${s.positions.length}):`));
      if (s.positions.length === 0) {
        console.log(chalk.dim('  No open positions.'));
      } else {
        printTable(s.positions as object[], POSITION_COLUMNS);
      }
      console.log('');
      return;
    }

    // Multi-wallet: fetch all summaries in parallel
    const sumSpin = spinner('Fetching wallet summaries…');
    const summaryResults = await Promise.all(
      wallets.map((w) => perpsApi.getSubAccountSummary(creds.accessToken, getSubAccountId(w))),
    );
    const aggRes = await perpsApi.getAggregatedSummary(creds.accessToken);
    sumSpin.stop();

    let totalPositions = 0;
    for (let i = 0; i < wallets.length; i++) {
      const w = wallets[i];
      const sumRes = summaryResults[i];
      const raw = sumRes.success && sumRes.data ? sumRes.data as Record<string, unknown> : w as Record<string, unknown>;
      const s = normalizeWalletSummary(raw);
      totalPositions += s.positions.length;

      console.log('');
      console.log(chalk.bold(`${getSubAccountLabel(w)}:`));
      console.log(`  Equity        : ${fmt(s.equity)}`);
      console.log(`  Unrealized PnL: ${pnlFmt(s.unrealizedPnl)}`);
      console.log(`  Margin Used   : ${fmt(s.margin)}`);

      if (s.positions.length === 0) {
        console.log(chalk.dim('  No open positions.'));
      } else {
        printTable(s.positions as object[], POSITION_COLUMNS);
      }
    }

    console.log('');
    if (aggRes.success && aggRes.data) {
      const agg = aggRes.data as Record<string, unknown>;
      const aggS = normalizeWalletSummary(agg);
      console.log(chalk.bold('Aggregated:'));
      console.log(`  Total Equity     : ${fmt(aggS.equity || Number(agg.totalEquity ?? 0))}`);
      console.log(`  Total Unrl. PnL  : ${pnlFmt(aggS.unrealizedPnl || Number(agg.totalUnrealizedPnl ?? 0))}`);
      console.log(`  Total Margin     : ${fmt(aggS.margin || Number(agg.totalMarginUsed ?? 0))}`);
    }
    console.log(chalk.dim(`  Total positions: ${totalPositions}`));
    console.log('');
  }));

// ─── order ───────────────────────────────────────────────────────────────

interface OrderOpts {
  yes?: boolean;
  side?: string;
  symbol?: string;
  type?: string;
  price?: string;
  size?: string;
  reduceOnly?: boolean;
  grouping?: string;
  wallet?: string;
  /** trigger type: tp (take profit) or sl (stop loss), for market orders only */
  tpsl?: 'tp' | 'sl';
}

const orderCmd = new Command('order')
  .description('Place a perps order')
  .option(WALLET_OPT[0], WALLET_OPT[1])
  .option('-y, --yes', 'Skip confirmation')
  .option('-S, --side <side>', 'Order side: long/buy or short/sell')
  .option('-s, --symbol <symbol>', 'Asset symbol (e.g. BTC, ETH)')
  .option('-T, --type <type>', 'Order type: market or limit', 'market')
  .option('-p, --price <price>', 'Limit price (required for limit orders)')
  .option('-z, --size <size>', 'Position size in contracts')
  .option('-r, --reduce-only', 'Reduce-only order')
  .option('-g, --grouping <grouping>', 'TP/SL grouping: na, normalTpsl, positionTpsl', 'na')
  .option('--tpsl <type>', 'Trigger type for market orders: tp (take profit) or sl (stop loss)', 'tp')
  .action(wrapAction(async (opts: OrderOpts) => {
    const creds = requireAuth();

    const resolved = await resolveWallet(creds.accessToken, opts.wallet, 'Place order on which wallet?');
    if (!resolved) return;
    const { wallet, walletId } = resolved;

    // Check autopilot for this wallet
    const apSpin = spinner('Checking autopilot…');
    const allStates = await getAllAutopilotStates(creds.accessToken);
    apSpin.stop();
    const wId = getSubAccountId(wallet);
    const walletStrategies = getAllStrategiesForWallet(allStates, wId, !!wallet.isDefault);
    const activeStrategy = walletStrategies.find((s) => s.active);
    if (activeStrategy) {
      console.log('');
      warn(`Autopilot "${strategyDisplayName(activeStrategy)}" is ON for "${wallet.name ?? 'this wallet'}". Manual order placement is disabled while AI is trading.`);
      info(`Trading symbols: ${activeStrategy.symbols?.join(', ') ?? 'unknown'}`);
      info('Turn off autopilot first: minara perps autopilot');
      console.log('');
      return;
    }

    // Determine if running in non-interactive mode
    const nonInteractive = opts.side && opts.symbol && opts.size;

    info('Building a Hyperliquid perps order…');

    const dataSpin = spinner('Fetching market data…');
    const address = await perpsApi.getPerpsAddress(creds.accessToken);
    const [assets, leverages] = await Promise.all([
      perpsApi.getAssetMeta(),
      address ? perpsApi.getUserLeverage(address) : Promise.resolve([]),
    ]);
    dataSpin.stop();

    const leverageMap = new Map<string, { value: number; type: string }>();
    for (const l of leverages) {
      leverageMap.set(l.coin.toUpperCase(), { value: l.leverageValue, type: l.leverageType });
    }

    // ── Side ─────────────────────────────────────────────────────────────
    let isBuy: boolean;
    if (opts.side) {
      const sideLower = opts.side.toLowerCase();
      if (sideLower === 'long' || sideLower === 'buy') {
        isBuy = true;
      } else if (sideLower === 'short' || sideLower === 'sell') {
        isBuy = false;
      } else {
        console.error(chalk.red('✖'), `Invalid side: ${opts.side}. Use 'long', 'buy', 'short', or 'sell'.`);
        process.exit(1);
      }
    } else {
      isBuy = await select({
        message: 'Side:',
        choices: [
          { name: 'Long  (buy)', value: true },
          { name: 'Short (sell)', value: false },
        ],
      });
    }

    // ── Asset ────────────────────────────────────────────────────────────
    let asset: string;
    if (opts.symbol) {
      asset = opts.symbol.toUpperCase();
    } else if (assets.length > 0) {
      asset = await select({
        message: 'Asset:',
        choices: assets.map((a) => {
          const pxStr = a.markPx > 0 ? `$${a.markPx.toLocaleString()}` : '';
          const lev = leverageMap.get(a.name.toUpperCase());
          const levStr = lev ? `${lev.value}x ${lev.type}` : '';
          return {
            name: `${a.name.padEnd(6)} ${chalk.dim(pxStr.padStart(12))}  ${chalk.dim(`max ${a.maxLeverage}x`)}${levStr ? `  ${chalk.cyan(levStr)}` : ''}`,
            value: a.name,
          };
        }),
      });
    } else {
      asset = await input({ message: 'Asset symbol (e.g. BTC, ETH):' });
    }

    const currentLev = leverageMap.get(asset.toUpperCase());
    if (currentLev) {
      info(`Current leverage: ${currentLev.value}x (${currentLev.type})`);
    } else {
      info(`No leverage set for ${asset} — use 'minara perps leverage' to configure`);
    }

    // ── Order Type ───────────────────────────────────────────────────────
    let orderType: 'market' | 'limit';
    if (opts.type) {
      const typeLower = opts.type.toLowerCase();
      if (typeLower === 'market') {
        orderType = 'market';
      } else if (typeLower === 'limit') {
        orderType = 'limit';
      } else {
        console.error(chalk.red('✖'), `Invalid order type: ${opts.type}. Use 'market' or 'limit'.`);
        process.exit(1);
      }
    } else {
      orderType = await select({
        message: 'Order type:',
        choices: [
          { name: 'Market', value: 'market' as const },
          { name: 'Limit', value: 'limit' as const },
        ],
      });
    }

    // ── Price ────────────────────────────────────────────────────────────
    const assetMeta = assets.find((a) => a.name.toUpperCase() === asset.toUpperCase());
    let limitPx: string;
    let marketPx: number | undefined;

    if (orderType === 'limit') {
      if (opts.price) {
        limitPx = opts.price;
      } else if (nonInteractive) {
        console.error(chalk.red('✖'), 'Limit orders require --price');
        process.exit(1);
      } else {
        limitPx = await input({ message: 'Limit price:' });
      }
    } else {
      // Market order
      marketPx = assetMeta?.markPx;
      if (opts.price) {
        // User specified price for market order (use as trigger)
        limitPx = opts.price;
        marketPx = Number(opts.price);
        info(`Market order at ~$${marketPx}`);
      } else if (marketPx && marketPx > 0) {
        const slippagePx = isBuy ? marketPx * 1.01 : marketPx * 0.99;
        limitPx = slippagePx.toPrecision(5);
        info(`Market order at ~$${marketPx}`);
      } else if (nonInteractive) {
        console.error(chalk.red('✖'), `Could not fetch current price for ${asset}. Use --price to specify.`);
        process.exit(1);
      } else {
        warn(`Could not fetch current price for ${asset}. Enter the approximate market price.`);
        limitPx = await input({ message: 'Price:' });
        marketPx = Number(limitPx);
      }
    }

    // ── Size ─────────────────────────────────────────────────────────────
    let sz: string;
    if (opts.size) {
      sz = opts.size;
    } else if (nonInteractive) {
      console.error(chalk.red('✖'), 'Size is required. Use --size');
      process.exit(1);
    } else {
      sz = await input({ message: 'Size (in contracts):' });
    }

    // ── Reduce Only ──────────────────────────────────────────────────────
    let reduceOnly: boolean;
    if (opts.reduceOnly !== undefined) {
      reduceOnly = opts.reduceOnly;
    } else if (nonInteractive) {
      reduceOnly = false;
    } else {
      reduceOnly = await confirm({ message: 'Reduce only?', default: false });
    }

    // ── Grouping ─────────────────────────────────────────────────────────
    let grouping: 'na' | 'normalTpsl' | 'positionTpsl';
    if (opts.grouping) {
      const groupingLower = opts.grouping.toLowerCase();
      if (groupingLower === 'na' || groupingLower === 'none') {
        grouping = 'na';
      } else if (groupingLower === 'normaltpsl' || groupingLower === 'normal_tpsl') {
        grouping = 'normalTpsl';
      } else if (groupingLower === 'positiontpsl' || groupingLower === 'position_tpsl') {
        grouping = 'positionTpsl';
      } else {
        console.error(chalk.red('✖'), `Invalid grouping: ${opts.grouping}. Use 'na', 'normalTpsl', or 'positionTpsl'.`);
        process.exit(1);
      }
    } else if (nonInteractive) {
      grouping = 'na';
    } else {
      grouping = await select({
        message: 'Grouping (TP/SL):',
        choices: [
          { name: 'None', value: 'na' as const },
          { name: 'Normal TP/SL', value: 'normalTpsl' as const },
          { name: 'Position TP/SL', value: 'positionTpsl' as const },
        ],
      });
    }

    const order: PerpsOrder = {
      a: asset,
      b: isBuy,
      p: limitPx,
      s: sz,
      r: reduceOnly,
      t: orderType === 'limit'
        ? { limit: { tif: 'Gtc' } }
        : { trigger: { triggerPx: String(marketPx ?? limitPx), tpsl: opts.tpsl ?? 'tp', isMarket: true } },
    };

    const priceLabel = orderType === 'market' ? `Market (~$${marketPx ?? limitPx})` : `$${limitPx}`;

    const levLabel = currentLev ? `${currentLev.value}x (${currentLev.type})` : '—';

    console.log('');
    console.log(chalk.bold('Order Preview:'));
    console.log(`  Asset        : ${chalk.bold(order.a)}`);
    console.log(`  Side         : ${formatOrderSide(order.b ? 'buy' : 'sell')}`);
    console.log(`  Leverage     : ${chalk.cyan(levLabel)}`);
    console.log(`  Type         : ${orderType === 'market' ? `Market (${opts.tpsl === 'sl' ? 'Stop Loss' : 'Take Profit'})` : 'Limit (GTC)'}`);
    console.log(`  Price        : ${chalk.yellow(priceLabel)}`);
    console.log(`  Size         : ${chalk.bold(order.s)}`);
    console.log(`  Reduce Only  : ${order.r ? chalk.yellow('Yes') : 'No'}`);
    console.log(`  Grouping     : ${grouping}`);
    console.log('');

    if (!opts.yes) {
      await requireTransactionConfirmation(`Perps ${order.b ? 'LONG' : 'SHORT'} ${order.a} · size ${order.s} @ ${priceLabel}`);
    }
    await requireTouchId();

    const spin = spinner('Placing order…');
    const res = await perpsApi.placeOrders(creds.accessToken, { orders: [order], grouping, subAccountId: walletId });
    spin.stop();
    assertApiOk(res, 'Order placement failed');
    success(`Order submitted on ${getSubAccountLabel(wallet)}!`);
    printTxResult(res.data);
  }));

// ─── cancel ──────────────────────────────────────────────────────────────

const cancelCmd = new Command('cancel')
  .description('Cancel perps orders')
  .option(WALLET_OPT[0], WALLET_OPT[1])
  .option('-y, --yes', 'Skip confirmation')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    const resolved = await resolveWallet(creds.accessToken, opts.wallet, 'Cancel orders on which wallet?');
    if (!resolved) return;
    const { wallet, walletId } = resolved;

    const spin = spinner('Fetching open orders…');
    const wId = getSubAccountId(wallet);
    let openOrders;

    if (walletId) {
      const ordRes = await perpsApi.getSubAccountOpenOrders(creds.accessToken, wId);
      openOrders = ordRes.success && Array.isArray(ordRes.data) ? ordRes.data as Record<string, unknown>[] : [];
    } else {
      const address = await perpsApi.getPerpsAddress(creds.accessToken);
      if (!address) {
        spin.stop();
        warn('Could not find your perps wallet address.');
        return;
      }
      openOrders = await perpsApi.getOpenOrders(address) as unknown as Record<string, unknown>[];
    }
    spin.stop();

    if (openOrders.length === 0) {
      info(`No open orders on ${getSubAccountLabel(wallet)}.`);
      return;
    }

    const selected = await select({
      message: 'Select order to cancel:',
      choices: openOrders.map((o) => {
        const side = o.side === 'B' ? chalk.green('BUY') : chalk.red('SELL');
        const px = `$${Number(o.limitPx ?? 0).toLocaleString()}`;
        return {
          name: `${chalk.bold(String(o.coin ?? '').padEnd(6))} ${side}  ${o.sz} @ ${chalk.yellow(px)}  ${chalk.dim(`oid:${o.oid}`)}`,
          value: o,
        };
      }),
    });

    if (!opts.yes) {
      const sideLabel = selected.side === 'B' ? 'BUY' : 'SELL';
      const ok = await confirm({
        message: `Cancel ${sideLabel} ${selected.coin} ${selected.sz} @ $${Number(selected.limitPx ?? 0).toLocaleString()}?`,
        default: false,
      });
      if (!ok) return;
    }

    const cancelSpin = spinner('Cancelling…');
    const res = await perpsApi.cancelOrders(creds.accessToken, {
      cancels: [{ a: String(selected.coin), o: Number(selected.oid) }],
      subAccountId: walletId,
    });
    cancelSpin.stop();
    assertApiOk(res, 'Order cancellation failed');
    success('Order cancelled');
    printTxResult(res.data);
  }));

// ─── close position ─────────────────────────────────────────────────────

const closeCmd = new Command('close')
  .description('Close an open perps position at market price')
  .option(WALLET_OPT[0], WALLET_OPT[1])
  .option('-y, --yes', 'Skip confirmation')
  .option('-a, --all', 'Close all open positions (non-interactive)')
  .option('-s, --symbol <symbol>', 'Close position by symbol (non-interactive, e.g. BTC, ETH)')
  .action(wrapAction(async (opts: { yes?: boolean; all?: boolean; symbol?: string; wallet?: string }) => {
    const creds = requireAuth();

    const resolved = await resolveWallet(creds.accessToken, opts.wallet, 'Close position on which wallet?');
    if (!resolved) return;
    const { wallet, walletId } = resolved;

    const spin = spinner('Fetching positions…');
    let d: Record<string, unknown>;
    const wId = getSubAccountId(wallet);

    if (walletId) {
      const sumRes = await perpsApi.getSubAccountSummary(creds.accessToken, wId);
      d = sumRes.success && sumRes.data ? sumRes.data as Record<string, unknown> : {};
    } else {
      const res = await perpsApi.getAccountSummary(creds.accessToken);
      d = res.success && res.data ? res.data as Record<string, unknown> : {};
    }
    const assets = await perpsApi.getAssetMeta();
    spin.stop();

    const positions = Array.isArray(d.positions) ? d.positions as Record<string, unknown>[] : [];

    if (positions.length === 0) {
      info(`No open positions on ${getSubAccountLabel(wallet)}.`);
      return;
    }

    const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const pnlFmt = (n: number) => {
      const color = n >= 0 ? chalk.green : chalk.red;
      return color(`${n >= 0 ? '+' : ''}${fmt(n)}`);
    };

    // Helper to close specific positions (used by --all and --symbol)
    const closePositions = async (positionsToClose: Record<string, unknown>[], title: string) => {
      console.log('');
      console.log(chalk.bold(title));
      console.log(`  Positions to close: ${positionsToClose.length}`);
      positionsToClose.forEach((p) => {
        const symbol = String(p.symbol ?? '');
        const side = String(p.side ?? '').toLowerCase();
        const sideLabel = side === 'long' || side === 'buy' ? 'LONG' : 'SHORT';
        const sz = String(p.size ?? '');
        console.log(`    - ${symbol} ${sideLabel} ${sz}`);
      });
      console.log('');

      if (!opts.yes) {
        await requireTransactionConfirmation(`Close ${positionsToClose.length} position(s) @ Market`);
      }
      await requireTouchId();

      const orderSpin = spinner('Closing positions…');
      const results: { symbol: string; side: string; success: boolean; error?: string }[] = [];

      for (const pos of positionsToClose) {
        const symbol = String(pos.symbol ?? '');
        const side = String(pos.side ?? '').toLowerCase();
        const sz = String(pos.size ?? '');
        const isLong = side === 'long' || side === 'buy';
        const isBuy = !isLong;

        const assetMeta = assets.find((a) => a.name.toUpperCase() === symbol.toUpperCase());
        const marketPx = assetMeta?.markPx;

        if (!marketPx || marketPx <= 0) {
          results.push({ symbol, side, success: false, error: 'Could not fetch price' });
          continue;
        }

        const slippagePx = isBuy ? marketPx * 1.01 : marketPx * 0.99;
        const limitPx = slippagePx.toPrecision(5);

        const order: PerpsOrder = {
          a: symbol,
          b: isBuy,
          p: limitPx,
          s: sz,
          r: true,
          t: { trigger: { triggerPx: String(marketPx), tpsl: 'tp', isMarket: true } },
        };

        try {
          const orderRes = await perpsApi.placeOrders(creds.accessToken, { orders: [order], grouping: 'na', subAccountId: walletId });
          if (orderRes.success) {
            results.push({ symbol, side, success: true });
          } else {
            const errMsg = orderRes.error ? `${orderRes.error.code}: ${orderRes.error.message}` : 'Unknown error';
            results.push({ symbol, side, success: false, error: errMsg });
          }
        } catch (e) {
          results.push({ symbol, side, success: false, error: String(e) });
        }
      }

      orderSpin.stop();

      // Report results
      const succeeded = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      if (succeeded.length > 0) {
        success(`Closed ${succeeded.length} position(s):`);
        succeeded.forEach((r) => {
          console.log(`  ✓ ${r.symbol} ${r.side.toUpperCase()}`);
        });
      }

      if (failed.length > 0) {
        warn(`Failed to close ${failed.length} position(s):`);
        failed.forEach((r) => {
          console.log(`  ✗ ${r.symbol} ${r.side.toUpperCase()}: ${r.error}`);
        });
      }
    };

    // If --all flag is set, close all positions directly (non-interactive)
    if (opts.all) {
      await closePositions(positions, 'Close ALL Positions:');
      return;
    }

    // If --symbol flag is set, close positions matching the symbol (non-interactive)
    if (opts.symbol) {
      const symbolUpper = opts.symbol.toUpperCase();
      const matchingPositions = positions.filter(
        (p) => String(p.symbol ?? '').toUpperCase() === symbolUpper
      );
      if (matchingPositions.length === 0) {
        warn(`No open positions found for symbol: ${opts.symbol}`);
        return;
      }
      await closePositions(matchingPositions, `Close ${opts.symbol.toUpperCase()} Positions:`);
      return;
    }

    // Build position choices with ALL option at the top
    type PositionOrAll = Record<string, unknown> | '__ALL__';
    const positionChoices: { name: string; value: PositionOrAll }[] = positions.map((p) => {
      const symbol = String(p.symbol ?? '');
      const side = String(p.side ?? '').toLowerCase();
      const sideLabel = side === 'long' || side === 'buy' ? chalk.green('LONG') : chalk.red('SHORT');
      const sz = String(p.size ?? '');
      const entry = fmt(Number(p.entryPrice ?? 0));
      const pnl = pnlFmt(Number(p.unrealizedPnl ?? 0));
      return {
        name: `${chalk.bold(symbol.padEnd(6))} ${sideLabel}  ${sz} @ ${chalk.yellow(entry)}  PnL: ${pnl}`,
        value: p,
      };
    });

    // Add "ALL POSITIONS" option at the beginning
    const allOption: { name: string; value: PositionOrAll } = { name: chalk.bold.cyan('[ CLOSE ALL POSITIONS ]'), value: '__ALL__' };
    const choices = [allOption, ...positionChoices];

    const selected = await select<PositionOrAll>({
      message: 'Select position to close:',
      choices,
    });

    // Handle "ALL POSITIONS" selection
    if (selected === '__ALL__') {
      await closePositions(positions, 'Close ALL Positions:');
      return;
    }

    // Single position close (existing logic)
    const symbol = String(selected.symbol ?? '');
    const side = String(selected.side ?? '').toLowerCase();
    const sz = String(selected.size ?? '');
    const isLong = side === 'long' || side === 'buy';
    const isBuy = !isLong;

    const assetMeta = assets.find((a) => a.name.toUpperCase() === symbol.toUpperCase());
    const marketPx = assetMeta?.markPx;

    if (!marketPx || marketPx <= 0) {
      warn(`Could not fetch current price for ${symbol}. Cannot place market close order.`);
      return;
    }

    const slippagePx = isBuy ? marketPx * 1.01 : marketPx * 0.99;
    const limitPx = slippagePx.toPrecision(5);

    const order: PerpsOrder = {
      a: symbol,
      b: isBuy,
      p: limitPx,
      s: sz,
      r: true,
      t: { trigger: { triggerPx: String(marketPx), tpsl: 'tp', isMarket: true } },
    };

    const sideLabel = isLong ? 'LONG' : 'SHORT';
    console.log('');
    console.log(chalk.bold('Close Position:'));
    console.log(`  Asset    : ${chalk.bold(symbol)}`);
    console.log(`  Position : ${formatOrderSide(isLong ? 'buy' : 'sell')} ${sz}`);
    console.log(`  Close    : ${formatOrderSide(isBuy ? 'buy' : 'sell')} (market ~$${marketPx.toLocaleString()})`);
    console.log('');

    if (!opts.yes) {
      await requireTransactionConfirmation(`Close ${sideLabel} ${symbol} · size ${sz} @ Market (~$${marketPx.toLocaleString()})`);
    }
    await requireTouchId();

    const orderSpin = spinner('Closing position…');
    const orderRes = await perpsApi.placeOrders(creds.accessToken, { orders: [order], grouping: 'na', subAccountId: walletId });
    orderSpin.stop();
    assertApiOk(orderRes, 'Close position failed');
    success(`Position closed — ${sideLabel} ${symbol} ${sz}`);
    printTxResult(orderRes.data);
  }));

// ─── leverage ────────────────────────────────────────────────────────────

const leverageCmd = new Command('leverage')
  .description('Update leverage for a symbol')
  .option(WALLET_OPT[0], WALLET_OPT[1])
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    const resolved = await resolveWallet(creds.accessToken, opts.wallet, 'Update leverage on which wallet?');
    if (!resolved) return;
    const { wallet, walletId } = resolved;

    const metaSpin = spinner('Fetching available assets…');
    const assets = await perpsApi.getAssetMeta();
    metaSpin.stop();

    let symbol: string;
    if (assets.length > 0) {
      symbol = await select({
        message: 'Asset:',
        choices: assets.map((a) => {
          const pxStr = a.markPx > 0 ? `$${a.markPx.toLocaleString()}` : '';
          return {
            name: `${a.name.padEnd(6)} ${chalk.dim(pxStr.padStart(12))}  ${chalk.dim(`max ${a.maxLeverage}x`)}`,
            value: a.name,
          };
        }),
      });
    } else {
      symbol = await input({ message: 'Symbol (e.g. BTC):' });
    }

    const meta = assets.find((a) => a.name.toUpperCase() === symbol.toUpperCase());
    const maxLev = meta?.maxLeverage ?? 50;

    const leverage = await numberPrompt({
      message: `Leverage (1–${maxLev}x):`,
      min: 1,
      max: maxLev,
      required: true,
    });

    const isCross = await select({
      message: 'Margin mode:',
      choices: [
        { name: 'Cross', value: true },
        { name: 'Isolated', value: false },
      ],
    });

    const spin = spinner('Updating leverage…');
    const res = await perpsApi.updateLeverage(creds.accessToken, { symbol, isCross, leverage: leverage!, subAccountId: walletId });
    spin.stop();
    assertApiOk(res, 'Failed to update leverage');
    success(`Leverage set to ${leverage}x (${isCross ? 'cross' : 'isolated'}) for ${symbol} on ${getSubAccountLabel(wallet)}`);
  }));

// ─── trades ──────────────────────────────────────────────────────────────

const tradesCmd = new Command('trades')
  .description('View your perps trade fills')
  .option('-n, --count <n>', 'Number of recent fills to show', '20')
  .option('-d, --days <n>', 'Look back N days', '7')
  .option(WALLET_OPT[0], WALLET_OPT[1])
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    const resolved = await resolveWallet(creds.accessToken, opts.wallet, 'View trades for which wallet?');
    if (!resolved) return;
    const { wallet, walletId } = resolved;

    const days = Math.max(1, parseInt(opts.days, 10) || 7);
    const startTime = Date.now() - days * 24 * 60 * 60 * 1000;

    const spin = spinner('Fetching trade history…');
    let fills: Record<string, unknown>[];

    if (walletId) {
      const fillRes = await perpsApi.getSubAccountFills(creds.accessToken, walletId, startTime);
      fills = fillRes.success && Array.isArray(fillRes.data) ? fillRes.data as Record<string, unknown>[] : [];
    } else {
      const address = await perpsApi.getPerpsAddress(creds.accessToken);
      if (!address) {
        spin.stop();
        warn('Could not find your perps wallet address.');
        return;
      }
      fills = await perpsApi.getUserFills(address, days) as unknown as Record<string, unknown>[];
    }
    spin.stop();

    const limit = Math.max(1, parseInt(opts.count, 10) || 20);
    const recent = fills.slice(0, limit);

    const totalPnl = fills.reduce((s, f) => s + Number((f as Record<string, unknown>).closedPnl ?? 0), 0);
    const totalFees = fills.reduce((s, f) => s + Number((f as Record<string, unknown>).fee ?? 0), 0);
    const closingFills = fills.filter((f) => Number((f as Record<string, unknown>).closedPnl ?? 0) !== 0);
    const wins = closingFills.filter((f) => Number((f as Record<string, unknown>).closedPnl) > 0).length;
    const pnlColor = totalPnl >= 0 ? chalk.green : chalk.red;
    const fmtLocal = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    console.log('');
    console.log(chalk.bold(`Trade Fills — ${getSubAccountLabel(wallet)} (last ${days}d — ${fills.length} fills):`));
    console.log(`  Realized PnL : ${pnlColor(`${totalPnl >= 0 ? '+' : ''}${fmtLocal(totalPnl)}`)}`);
    console.log(`  Total Fees   : ${chalk.dim(fmtLocal(totalFees))}`);
    if (closingFills.length > 0) {
      console.log(`  Win Rate     : ${wins}/${closingFills.length} (${((wins / closingFills.length) * 100).toFixed(1)}%)`);
    }
    console.log('');

    if (recent.length > 0) {
      console.log(chalk.dim(`Showing ${recent.length} most recent:`));
      printTable(recent as unknown as Record<string, unknown>[], FILL_COLUMNS);
    } else {
      console.log(chalk.dim('  No trade fills in this period.'));
    }
    console.log('');
  }));

// ─── fund-records ────────────────────────────────────────────────────────

const fundRecordsCmd = new Command('fund-records')
  .description('View perps fund deposit/withdraw records')
  .option('-p, --page <n>', 'Page', '1')
  .option('-l, --limit <n>', 'Limit', '20')
  .option(WALLET_OPT[0], WALLET_OPT[1])
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    const resolved = await resolveWallet(creds.accessToken, opts.wallet, 'View records for which wallet?');
    if (!resolved) return;
    const { wallet, walletId } = resolved;

    const page = parseInt(opts.page, 10);
    const limit = parseInt(opts.limit, 10);

    const spin = spinner('Fetching records…');
    let data: Record<string, unknown>[] | undefined;

    if (walletId) {
      const wId = getSubAccountId(wallet);
      const recRes = await perpsApi.getSubAccountRecords(creds.accessToken, wId, page, limit);
      data = recRes.success && Array.isArray(recRes.data) ? recRes.data as Record<string, unknown>[] : [];
    } else {
      const res = await perpsApi.getFundRecords(creds.accessToken, page, limit);
      assertApiOk(res, 'Failed to fetch fund records');
      data = Array.isArray(res.data) ? res.data as Record<string, unknown>[] : [];
    }
    spin.stop();

    console.log('');
    console.log(chalk.bold(`Fund Records — ${getSubAccountLabel(wallet)}:`));
    if (data && data.length > 0) {
      printTable(data);
    } else {
      console.log(chalk.dim('  No fund records.'));
    }
    console.log('');
  }));

// ─── autopilot ──────────────────────────────────────────────────────────

const autopilotCmd = new Command('autopilot')
  .alias('ap')
  .description('Manage AI autopilot trading strategy (per wallet)')
  .option(WALLET_OPT[0], WALLET_OPT[1])
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    const loadSpin = spinner('Loading wallets & strategies…');
    const [wallets, allStates, supported] = await Promise.all([
      fetchSubAccounts(creds.accessToken),
      getAllAutopilotStates(creds.accessToken),
      perpsApi.getSupportedSymbols(creds.accessToken).then((r) => extractSymbolNames(r.success ? r.data : null)),
    ]);
    loadSpin.stop();

    // ── Pick wallet ──────────────────────────────────────────────────
    let wallet: PerpSubAccount;
    if (wallets.length === 0) {
      warn('No perps wallets found.');
      return;
    } else if (opts.wallet) {
      const nameUpper = (opts.wallet as string).toUpperCase();
      const match = wallets.find((w) =>
        (w.name ?? '').toUpperCase() === nameUpper || getSubAccountId(w) === opts.wallet
      );
      if (!match) {
        warn(`Wallet "${opts.wallet}" not found. Available: ${wallets.map((w) => w.name ?? getSubAccountId(w)).join(', ')}`);
        return;
      }
      wallet = match;
    } else if (wallets.length === 1) {
      wallet = wallets[0];
    } else {
      const summaries = await Promise.all(
        wallets.map((w) => perpsApi.getSubAccountSummary(creds.accessToken, getSubAccountId(w))),
      );
      wallet = await select<PerpSubAccount>({
        message: 'Select wallet for autopilot:',
        choices: wallets.map((w, i) => {
          const wId = getSubAccountId(w);
          const wStrategies = getAllStrategiesForWallet(allStates, wId, !!w.isDefault);
          const activeCount = wStrategies.filter((st) => st.active).length;
          let apLabel: string;
          if (wStrategies.length === 0) {
            apLabel = chalk.dim(' [No Strategy]');
          } else if (activeCount > 0) {
            apLabel = chalk.green(` [${activeCount}/${wStrategies.length} ON]`);
          } else {
            apLabel = chalk.dim(` [${wStrategies.length} strategies, all OFF]`);
          }
          const raw = summaries[i].success && summaries[i].data
            ? summaries[i].data as Record<string, unknown> : w as Record<string, unknown>;
          const s = normalizeWalletSummary(raw);
          return {
            name: `${getSubAccountLabel(w)}  ${chalk.dim(fmt(s.available))}${apLabel}`,
            value: w,
          };
        }),
      });
    }

    const walletId = getSubAccountId(wallet);
    const walletStrategies = getAllStrategiesForWallet(allStates, walletId, !!wallet.isDefault);

    // ── No strategies for this wallet — offer create or attach ───────
    if (walletStrategies.length === 0) {
      console.log('');
      info(`No autopilot strategies on ${getSubAccountLabel(wallet)}.`);

      const unbound = allStates.filter((s) => s.strategyId && !s.subAccountId);
      const action = await select({
        message: 'What would you like to do?',
        choices: [
          { name: chalk.green('Create new strategy'), value: 'create' as const },
          ...(unbound.length > 0
            ? [{ name: `Attach unbound strategy (${unbound.length} available)`, value: 'attach' as const }]
            : []),
          { name: 'Back', value: 'back' as const },
        ],
      });

      if (action === 'back') return;

      if (action === 'create') {
        await createNewStrategy(creds.accessToken, supported, walletId, wallet);
        return;
      }

      if (action === 'attach' && unbound.length > 0) {
        const picked = await select<AutopilotState>({
          message: 'Select strategy to attach:',
          choices: unbound.map((s) => ({
            name: `${strategyDisplayName(s)}  ${s.symbols?.join(', ') ?? '—'}  ${s.active ? chalk.green('ON') : chalk.dim('OFF')}`,
            value: s,
          })),
        });
        info(`Strategy: ${picked.strategyId} — ${strategyDisplayName(picked)} (${picked.symbols?.join(', ')})`);
        return;
      }
      return;
    }

    // ── Show all strategies overview ─────────────────────────────────
    console.log('');
    console.log(chalk.bold(`Autopilot Strategies — ${getSubAccountLabel(wallet)} (${walletStrategies.length}):`));
    console.log('');

    for (const s of walletStrategies) {
      const statusIcon = s.active ? chalk.green('● ON') : chalk.dim('○ OFF');
      const nameLabel = chalk.bold(strategyDisplayName(s));
      const symLabel = s.symbols && s.symbols.length > 0 ? s.symbols.join(', ') : chalk.dim('no symbols');
      console.log(`  ${statusIcon}  ${nameLabel}  —  ${symLabel}`);
      if (s.strategyId) {
        console.log(`       ID: ${chalk.dim(s.strategyId)}`);
      }
      if (s.createdAt) {
        console.log(`       Created: ${chalk.dim(s.createdAt)}`);
      }
    }
    console.log('');

    // ── Pick which strategy to manage ────────────────────────────────
    let state: AutopilotState;
    if (walletStrategies.length === 1) {
      state = walletStrategies[0];
    } else {
      state = await select<AutopilotState>({
        message: 'Select strategy to manage:',
        choices: [
          ...walletStrategies.map((s) => ({
            name: `${s.active ? chalk.green('●') : chalk.dim('○')} ${strategyDisplayName(s)}  ${s.symbols?.join(', ') ?? '—'}`,
            value: s,
          })),
          { name: chalk.green('+ Create new strategy'), value: { active: false } as AutopilotState },
        ],
      });

      if (!state.strategyId) {
        await createNewStrategy(creds.accessToken, supported, walletId, wallet);
        return;
      }
    }

    // ── Strategy dashboard ───────────────────────────────────────────
    await showAutopilotDashboard(creds.accessToken, wallet, state);

    // ── Action menu loop ─────────────────────────────────────────────
    let keepGoing = true;
    while (keepGoing) {
      const statusLabel = state.active ? chalk.green('ON') : chalk.dim('OFF');
      const action = await select({
        message: `${strategyDisplayName(state)} [${statusLabel}] — What would you like to do?`,
        choices: [
          ...(state.active
            ? [{ name: chalk.red('Turn OFF autopilot'), value: 'off' as const }]
            : [{ name: chalk.green('Turn ON autopilot'), value: 'on' as const }]),
          { name: 'Update symbols', value: 'update-symbols' as const },
          { name: 'Update strategy config', value: 'update-config' as const },
          { name: 'View performance', value: 'perf' as const },
          { name: 'View trading records', value: 'records' as const },
          { name: 'Back', value: 'back' as const },
        ],
      });

      switch (action) {
        case 'back':
          keepGoing = false;
          break;

        case 'on':
          if (state.strategyId) {
            const spin = spinner('Enabling autopilot…');
            const res = await perpsApi.enableStrategy(creds.accessToken, state.strategyId);
            spin.stop();
            assertApiOk(res, 'Failed to enable autopilot');
            state.active = true;
            success(`${strategyDisplayName(state)} is now ON`);
          }
          break;

        case 'off':
          if (state.strategyId) {
            const ok = await confirm({ message: `Turn off ${strategyDisplayName(state)}? AI will stop trading.`, default: false });
            if (!ok) break;
            const spin = spinner('Disabling autopilot…');
            const res = await perpsApi.disableStrategy(creds.accessToken, state.strategyId);
            spin.stop();
            assertApiOk(res, 'Failed to disable autopilot');
            state.active = false;
            success(`${strategyDisplayName(state)} is now OFF`);
          }
          break;

        case 'update-symbols': {
          info(`Supported: ${supported.join(', ')} | Current: ${state.symbols?.join(', ') ?? 'none'}`);
          const symbolsInput = await input({
            message: 'New symbols (comma-separated):',
            default: state.symbols?.join(',') ?? '',
          });
          const symbols = symbolsInput.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
          const spin = spinner('Updating symbols…');
          const res = await perpsApi.updateStrategy(creds.accessToken, {
            strategyId: state.strategyId!,
            symbols,
            strategyConfig: state.strategyConfig,
            language: state.language,
          });
          spin.stop();
          assertApiOk(res, 'Failed to update symbols');
          state.symbols = symbols;
          success(`Symbols updated: ${symbols.join(', ')}`);
          break;
        }

        case 'update-config': {
          console.log('');
          console.log(chalk.bold('Current strategy config:'));
          if (state.strategyConfig && Object.keys(state.strategyConfig).length > 0) {
            printKV(state.strategyConfig);
          } else {
            console.log(chalk.dim('  No custom config set.'));
          }
          console.log('');

          const configJson = await input({
            message: 'New config (JSON, or press Enter to keep current):',
            default: state.strategyConfig ? JSON.stringify(state.strategyConfig) : '{}',
          });

          let newConfig: Record<string, unknown>;
          try {
            newConfig = JSON.parse(configJson) as Record<string, unknown>;
          } catch {
            warn('Invalid JSON. Config not updated.');
            break;
          }

          const spin = spinner('Updating config…');
          const res = await perpsApi.updateStrategy(creds.accessToken, {
            strategyId: state.strategyId!,
            symbols: state.symbols ?? [],
            strategyConfig: newConfig,
            language: state.language,
          });
          spin.stop();
          assertApiOk(res, 'Failed to update config');
          state.strategyConfig = newConfig;
          success('Strategy config updated.');
          break;
        }

        case 'perf': {
          const spin = spinner('Fetching performance…');
          const res = await perpsApi.getPerformanceMetrics(creds.accessToken);
          spin.stop();
          if (res.success && res.data) {
            const ap = state.strategyConfig?.pattern !== undefined
              ? String(state.strategyConfig.pattern) : undefined;
            console.log('');
            console.log(chalk.bold(`Performance — ${strategyDisplayName(state)}:`));
            printPerformanceData(res.data as Record<string, unknown>, ap);
            console.log('');
          } else {
            console.log(chalk.dim('  No performance data available.'));
          }
          break;
        }

        case 'records': {
          const spin = spinner('Fetching records…');
          const res = await perpsApi.getRecords(creds.accessToken, 1, 20);
          spin.stop();
          if (res.success && Array.isArray(res.data) && res.data.length > 0) {
            console.log('');
            console.log(chalk.bold('Recent Autopilot Records:'));
            printTable(res.data as Record<string, unknown>[]);
            console.log('');
          } else {
            console.log(chalk.dim('  No autopilot records.'));
          }
          break;
        }
      }
    }
  }));

async function createNewStrategy(
  token: string,
  supported: string[],
  walletId: string,
  wallet: PerpSubAccount,
) {
  info(`Supported symbols: ${supported.join(', ')}`);
  const symbolsInput = await input({
    message: 'Symbols to trade (comma-separated):',
    default: supported.slice(0, 3).join(','),
  });
  const symbols = symbolsInput.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

  const configInput = await input({
    message: 'Strategy config (JSON, or press Enter for default):',
    default: '{}',
  });
  let strategyConfig: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(configInput) as Record<string, unknown>;
    if (Object.keys(parsed).length > 0) strategyConfig = parsed;
  } catch {
    warn('Invalid JSON — using default config.');
  }

  const spin = spinner('Creating autopilot strategy…');
  const res = await perpsApi.createStrategy(token, {
    symbols,
    subAccountId: walletId || undefined,
    strategyConfig,
  });
  spin.stop();
  assertApiOk(res, 'Failed to create autopilot strategy');
  success(`Autopilot created for ${symbols.join(', ')} on ${getSubAccountLabel(wallet)}!`);
}

async function showAutopilotDashboard(
  token: string,
  wallet: PerpSubAccount,
  state: AutopilotState,
) {
  const statusLabel = state.active ? chalk.green.bold('ON') : chalk.dim('OFF');
  const nameLabel = strategyDisplayName(state);

  console.log('');
  console.log(chalk.bold(`Strategy: ${nameLabel}`) + `  ${statusLabel}  (${getSubAccountLabel(wallet)})`);
  console.log('');

  // ── Basic info ──────────────────────────────────────────────────
  const infoRows: [string, string][] = [];
  if (state.strategyId) infoRows.push(['ID', chalk.dim(state.strategyId)]);
  if (state.symbols && state.symbols.length > 0) infoRows.push(['Symbols', state.symbols.join(', ')]);
  if (state.language) infoRows.push(['Language', state.language]);
  if (state.createdAt) infoRows.push(['Created', chalk.dim(formatDateStr(state.createdAt))]);
  if (state.updatedAt) infoRows.push(['Updated', chalk.dim(formatDateStr(state.updatedAt))]);

  const activePattern = state.strategyConfig?.pattern !== undefined
    ? String(state.strategyConfig.pattern) : undefined;
  if (activePattern) infoRows.push(['Using', chalk.cyan.bold(`Strategy ${activePattern}`)]);

  if (infoRows.length > 0) {
    const maxLabel = Math.max(...infoRows.map(([l]) => l.length));
    for (const [label, val] of infoRows) {
      console.log(`  ${label.padEnd(maxLabel)} : ${val}`);
    }
  }

  // ── Strategy Config ─────────────────────────────────────────────
  if (state.strategyConfig && Object.keys(state.strategyConfig).length > 0) {
    console.log('');
    console.log(chalk.bold('  Config:'));
    for (const [k, v] of Object.entries(state.strategyConfig)) {
      if (k === 'pattern') continue;
      if (v && typeof v === 'object') {
        console.log(`    ${chalk.dim(k)}:`);
        for (const [ik, iv] of Object.entries(v as Record<string, unknown>)) {
          console.log(`      ${ik.padEnd(20)} : ${chalk.cyan(String(iv))}`);
        }
      } else {
        console.log(`    ${chalk.dim(k).padEnd(24)} : ${chalk.cyan(String(v))}`);
      }
    }
  }

  // ── Performance ─────────────────────────────────────────────────
  const perfSpin = spinner('Fetching performance…');
  const perfRes = await perpsApi.getPerformanceMetrics(token);
  perfSpin.stop();

  if (perfRes.success && perfRes.data) {
    console.log('');
    console.log(chalk.bold('  Performance (all strategies):'));
    printPerformanceData(perfRes.data as Record<string, unknown>, activePattern);
  }

  console.log('');
}

function formatDateStr(d: string): string {
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return d;
  }
}

/**
 * Render performance metrics. Handles two formats:
 * 1. Pattern-based: { "1": { estAPR, tradesCount }, "2": { ... }, ... }
 * 2. Flat: { totalPnl, winRate, ... }
 *
 * @param activePattern - If set, highlights the column for this pattern ID (e.g. "5")
 */
function printPerformanceData(data: Record<string, unknown>, activePattern?: string) {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    console.log(chalk.dim('    No data.'));
    return;
  }

  // Detect pattern-based format: keys are numeric, values are objects
  const isPatternBased = entries.every(([k, v]) => /^\d+$/.test(k) && v && typeof v === 'object');

  if (isPatternBased) {
    // Collect all metric keys across all patterns
    const allKeys = new Set<string>();
    for (const [, v] of entries) {
      for (const mk of Object.keys(v as Record<string, unknown>)) allKeys.add(mk);
    }
    const metricKeys = Array.from(allKeys);

    // Header
    const patternIds = entries.map(([k]) => k);
    const colWidth = 16;
    const labelCol = 16;
    const header = '    '
      + chalk.dim('Metric'.padEnd(labelCol))
      + patternIds.map((id) => {
        const label = `Strategy ${id}`;
        if (id === activePattern) return chalk.bold.cyan(`${label} ★`.padStart(colWidth));
        return chalk.bold(label.padStart(colWidth));
      }).join('');
    console.log(header);
    console.log('    ' + chalk.dim('─'.repeat(labelCol + colWidth * patternIds.length)));

    // Rows
    const metricLabels: Record<string, string> = {
      estAPR: 'Est. APR',
      tradesCount: 'Trades',
      pnl: 'PnL',
      winRate: 'Win Rate',
      sharpeRatio: 'Sharpe',
      maxDrawdown: 'Max DD',
    };

    for (const mk of metricKeys) {
      const label = (metricLabels[mk] ?? mk).padEnd(labelCol);
      const cells = entries.map(([id, v]) => {
        const val = (v as Record<string, unknown>)[mk];
        if (val === undefined || val === null) return chalk.dim('—'.padStart(colWidth));
        const num = Number(val);
        const isActive = id === activePattern;
        if (mk === 'estAPR' || mk.toLowerCase().includes('apr')) {
          const color = isActive ? chalk.cyan.bold : (num >= 0 ? chalk.green : chalk.red);
          return color(`${num.toFixed(2)}%`.padStart(colWidth));
        }
        if (mk.toLowerCase().includes('trades') || mk.toLowerCase().includes('count')) {
          const color = isActive ? chalk.cyan.bold : chalk.white;
          return color(num.toLocaleString().padStart(colWidth));
        }
        if (mk.toLowerCase().includes('pnl')) {
          return pnlFmt(num).padStart(colWidth);
        }
        return String(val).padStart(colWidth);
      });
      console.log(`    ${chalk.dim(label)}${cells.join('')}`);
    }
    return;
  }

  // Flat format: render as key-value pairs with smart formatting
  const flatFields: [string, string][] = [
    ['totalPnl', 'Total PnL'],
    ['totalPnlPercent', 'Total PnL %'],
    ['unrealizedPnl', 'Unrl. PnL'],
    ['realizedPnl', 'Realized PnL'],
    ['winRate', 'Win Rate'],
    ['totalTrades', 'Total Trades'],
    ['sharpeRatio', 'Sharpe Ratio'],
    ['maxDrawdown', 'Max Drawdown'],
    ['estAPR', 'Est. APR'],
    ['tradesCount', 'Trades'],
  ];

  const knownKeys = new Set(flatFields.map(([k]) => k));
  const allFields = [
    ...flatFields,
    ...entries.filter(([k]) => !knownKeys.has(k)).map(([k]) => [k, k] as [string, string]),
  ];

  for (const [key, label] of allFields) {
    const v = data[key];
    if (v === undefined || v === null) continue;

    if (typeof v === 'object') {
      console.log(`    ${chalk.dim(label)}`);
      for (const [ik, iv] of Object.entries(v as Record<string, unknown>)) {
        console.log(`      ${ik.padEnd(18)} : ${chalk.cyan(String(iv))}`);
      }
      continue;
    }

    const num = Number(v);
    let display: string;
    if (key.includes('Pnl') && !key.includes('Percent')) {
      display = pnlFmt(num);
    } else if (key.includes('Percent') || key === 'winRate' || key === 'maxDrawdown') {
      const color = num >= 0 ? chalk.green : chalk.red;
      display = color(`${num >= 0 ? '+' : ''}${num.toFixed(2)}%`);
    } else if (key.toLowerCase().includes('apr')) {
      const color = num >= 0 ? chalk.green : chalk.red;
      display = color(`${num.toFixed(2)}%`);
    } else if (key.toLowerCase().includes('trades') || key.toLowerCase().includes('count')) {
      display = num.toLocaleString();
    } else {
      display = String(v);
    }
    console.log(`    ${chalk.dim(label.padEnd(14))} : ${display}`);
  }
}

// ─── wallets (list all sub-wallets) ─────────────────────────────────────

const walletsCmd = new Command('wallets')
  .alias('w')
  .description('List all perps sub-wallets with balances, positions, and autopilot status')
  .action(wrapAction(async () => {
    const creds = requireAuth();

    const spin = spinner('Fetching wallets…');
    const [wallets, allStates] = await Promise.all([
      fetchSubAccounts(creds.accessToken),
      getAllAutopilotStates(creds.accessToken),
    ]);
    spin.stop();

    if (wallets.length === 0) {
      info('No perps wallets found. Create one with: minara perps create-wallet');
      return;
    }

    console.log('');
    console.log(chalk.bold(`Perps Wallets (${wallets.length}):`));
    console.log('');

    // Fetch per-wallet summaries in parallel for accurate financial data
    const summaryResults = await Promise.all(
      wallets.map((w) => perpsApi.getSubAccountSummary(creds.accessToken, getSubAccountId(w))),
    );

    for (let i = 0; i < wallets.length; i++) {
      const w = wallets[i];
      const sumRes = summaryResults[i];
      const raw = sumRes.success && sumRes.data
        ? sumRes.data as Record<string, unknown>
        : w as Record<string, unknown>;
      const s = normalizeWalletSummary(raw);
      const wId = getSubAccountId(w);
      const wStrategies = getAllStrategiesForWallet(allStates, wId, !!w.isDefault);
      const activeCount = wStrategies.filter((st) => st.active).length;
      let apLabel: string;
      if (wStrategies.length === 0) {
        apLabel = chalk.dim('[No AP]');
      } else if (activeCount > 0) {
        apLabel = chalk.green(`[${activeCount}/${wStrategies.length} AP ON]`);
      } else {
        apLabel = chalk.dim(`[${wStrategies.length} AP OFF]`);
      }
      const defLabel = w.isDefault ? chalk.cyan(' (default)') : '';

      console.log(`  ${chalk.bold(w.name ?? 'Unnamed')}${defLabel}  ${apLabel}`);
      if (w.address) {
        console.log(`    Address   : ${chalk.yellow(w.address)}`);
      }
      console.log(`    Equity    : ${fmt(s.equity)}`);
      console.log(`    Available : ${fmt(s.available)}`);
      console.log(`    Margin    : ${fmt(s.margin)}`);
      console.log(`    Unrl. PnL : ${pnlFmt(s.unrealizedPnl)}`);

      if (wStrategies.length > 0) {
        const apNames = wStrategies.map((st) =>
          `${strategyDisplayName(st)} (${st.symbols?.join(', ') ?? '—'})${st.active ? chalk.green(' ON') : ''}`,
        );
        console.log(`    Strategies: ${apNames.join(' | ')}`);
      }

      if (s.positions.length > 0) {
        console.log(`    Positions : ${s.positions.length} open`);
      }
      console.log('');
    }

    // Aggregated summary
    const aggSpin = spinner('Fetching aggregated summary…');
    const aggRes = await perpsApi.getAggregatedSummary(creds.accessToken);
    aggSpin.stop();

    if (aggRes.success && aggRes.data) {
      const agg = aggRes.data as Record<string, unknown>;
      const aggS = normalizeWalletSummary(agg);
      console.log(chalk.bold('Aggregated Summary:'));
      console.log(`  Total Equity     : ${fmt(aggS.equity || Number(agg.totalEquity ?? 0))}`);
      console.log(`  Total Unrl. PnL  : ${pnlFmt(aggS.unrealizedPnl || Number(agg.totalUnrealizedPnl ?? 0))}`);
      console.log(`  Total Margin     : ${fmt(aggS.margin || Number(agg.totalMarginUsed ?? 0))}`);
      console.log('');
    }
  }));

// ─── create-wallet ──────────────────────────────────────────────────────

const createWalletCmd = new Command('create-wallet')
  .description('Create a new perps sub-wallet')
  .option('-n, --name <name>', 'Wallet name (max 20 chars)')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    const name: string = opts.name ?? await input({
      message: 'Wallet name (max 20 characters):',
      validate: (v) => v.length > 0 && v.length <= 20 ? true : 'Name must be 1–20 characters',
    });

    const spin = spinner('Creating wallet…');
    const res = await perpsApi.createSubAccount(creds.accessToken, { name });
    spin.stop();
    assertApiOk(res, 'Failed to create wallet');
    success(`Wallet "${name}" created!`);
    if (res.data?.address) {
      console.log(`  Address: ${chalk.yellow(res.data.address)}`);
    }
  }));

// ─── rename-wallet ──────────────────────────────────────────────────────

const renameWalletCmd = new Command('rename-wallet')
  .description('Rename a perps sub-wallet')
  .action(wrapAction(async () => {
    const creds = requireAuth();

    const spin = spinner('Loading wallets…');
    const wallet = await pickSubAccount(creds.accessToken, 'Select wallet to rename:');
    spin.stop();
    if (!wallet) return;

    const newName = await input({
      message: `New name for "${wallet.name ?? 'Unnamed'}" (max 10 chars):`,
      validate: (v) => v.length > 0 && v.length <= 10 ? true : 'Name must be 1–10 characters',
    });

    const renameSpin = spinner('Renaming…');
    const res = await perpsApi.renameSubAccount(creds.accessToken, {
      subAccountId: getSubAccountId(wallet),
      name: newName,
    });
    renameSpin.stop();
    assertApiOk(res, 'Failed to rename wallet');
    success(`Wallet renamed to "${newName}"`);
  }));

// ─── sweep (consolidate sub-wallet funds to default) ────────────────────

const sweepCmd = new Command('sweep')
  .description('Consolidate funds from a sub-wallet to the default wallet')
  .option('-y, --yes', 'Skip confirmation')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    const loadSpin = spinner('Loading wallets & strategies…');
    const [wallets, allStates] = await Promise.all([
      fetchSubAccounts(creds.accessToken),
      getAllAutopilotStates(creds.accessToken),
    ]);

    const nonDefault = wallets.filter((w) => !w.isDefault);
    if (nonDefault.length === 0) {
      loadSpin.stop();
      info('No sub-wallets to sweep from. Only the default wallet exists.');
      return;
    }

    const summaries = await Promise.all(
      nonDefault.map((w) => perpsApi.getSubAccountSummary(creds.accessToken, getSubAccountId(w))),
    );
    loadSpin.stop();

    const wallet = await select<PerpSubAccount>({
      message: 'Select sub-wallet to sweep funds FROM:',
      choices: nonDefault.map((w, i) => {
        const wId = getSubAccountId(w);
        const wStrategies = getAllStrategiesForWallet(allStates, wId, !!w.isDefault);
        const hasActive = wStrategies.some((s) => s.active);
        const apLabel = hasActive ? chalk.red(' [AP ON — cannot sweep]') : '';
        const raw = summaries[i].success && summaries[i].data
          ? summaries[i].data as Record<string, unknown> : w as Record<string, unknown>;
        const s = normalizeWalletSummary(raw);
        const eq = fmt(s.available);
        return {
          name: `${getSubAccountLabel(w)}  ${chalk.dim(eq)}${apLabel}`,
          value: w,
        };
      }),
    });

    const walletId = getSubAccountId(wallet);
    const sweepStrategies = getAllStrategiesForWallet(allStates, walletId, !!wallet.isDefault);
    const activeAp = sweepStrategies.find((s) => s.active);

    if (activeAp) {
      console.log('');
      warn(`Autopilot "${strategyDisplayName(activeAp)}" is ON for "${wallet.name ?? 'Unnamed'}". You must turn it off before sweeping funds.`);
      info('Run: minara perps autopilot → select this wallet → Turn OFF');
      console.log('');
      return;
    }

    const equity = Number(wallet.equityValue ?? 0);
    if (equity <= 0) {
      info('This wallet has no funds to sweep.');
      return;
    }

    console.log('');
    console.log(chalk.bold('Sweep Funds:'));
    console.log(`  From   : ${getSubAccountLabel(wallet)}`);
    console.log(`  To     : Default wallet`);
    console.log(`  Amount : ${fmt(equity)} (all available)`);
    console.log('');

    if (!opts.yes) {
      await requireTransactionConfirmation(`Sweep funds from "${wallet.name}" to default wallet`);
    }
    await requireTouchId();

    const spin = spinner('Sweeping funds…');
    const res = await perpsApi.sweepFunds(creds.accessToken, { subAccountId: walletId });
    spin.stop();
    assertApiOk(res, 'Sweep failed');
    success(`Funds swept from "${wallet.name}" to default wallet`);
    printTxResult(res.data);
  }));

// ─── transfer (between sub-wallets) ─────────────────────────────────────

const transferCmd = new Command('transfer')
  .description('Transfer USDC between perps sub-wallets')
  .option('-a, --amount <amount>', 'USDC amount')
  .option('-y, --yes', 'Skip confirmation')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    const spin = spinner('Loading wallets…');
    const wallets = await fetchSubAccounts(creds.accessToken);
    if (wallets.length < 2) {
      spin.stop();
      info('You need at least 2 wallets to transfer between them. Create one with: minara perps create-wallet');
      return;
    }
    const summaries = await Promise.all(
      wallets.map((w) => perpsApi.getSubAccountSummary(creds.accessToken, getSubAccountId(w))),
    );
    spin.stop();

    const walletLabel = (w: PerpSubAccount, i: number) => {
      const raw = summaries[i].success && summaries[i].data
        ? summaries[i].data as Record<string, unknown> : w as Record<string, unknown>;
      const s = normalizeWalletSummary(raw);
      return `${getSubAccountLabel(w)}  ${chalk.dim(fmt(s.available))}`;
    };

    const from = await select<PerpSubAccount>({
      message: 'Transfer FROM:',
      choices: wallets.map((w, i) => ({
        name: walletLabel(w, i),
        value: w,
      })),
    });

    const toChoices = wallets
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => getSubAccountId(w) !== getSubAccountId(from));
    const to = await select<PerpSubAccount>({
      message: 'Transfer TO:',
      choices: toChoices.map(({ w, i }) => ({
        name: walletLabel(w, i),
        value: w,
      })),
    });

    const amount = opts.amount
      ? parseFloat(opts.amount)
      : await numberPrompt({ message: 'USDC amount to transfer:', min: 0.01, required: true });

    if (!amount || amount <= 0) {
      warn('Invalid amount.');
      return;
    }

    console.log('');
    console.log(chalk.bold('Transfer:'));
    console.log(`  From   : ${getSubAccountLabel(from)}`);
    console.log(`  To     : ${getSubAccountLabel(to)}`);
    console.log(`  Amount : ${fmt(amount)}`);
    console.log('');

    if (!opts.yes) {
      await requireTransactionConfirmation(`Transfer ${amount} USDC`);
    }
    await requireTouchId();

    const transferSpin = spinner('Transferring…');
    const fromId = from.isDefault ? undefined : getSubAccountId(from);
    const toId = to.isDefault ? undefined : getSubAccountId(to);
    const res = await perpsApi.transferFunds(creds.accessToken, {
      fromSubAccountId: fromId,
      toSubAccountId: toId,
      amount,
    });
    transferSpin.stop();
    assertApiOk(res, 'Transfer failed');
    success(`Transferred ${amount} USDC from "${from.name}" to "${to.name}"`);
    printTxResult(res.data);
  }));

// ─── ask (long/short analysis) ──────────────────────────────────────────

const askCmd = new Command('ask')
  .description('Get AI trading analysis for an asset (long/short recommendation)')
  .option(WALLET_OPT[0], WALLET_OPT[1])
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    const dataSpin = spinner('Fetching assets…');
    const assets = await perpsApi.getAssetMeta();
    dataSpin.stop();

    let symbol: string;
    if (assets.length > 0) {
      symbol = await select({
        message: 'Asset to analyze:',
        choices: assets.map((a) => {
          const pxStr = a.markPx > 0 ? `$${a.markPx.toLocaleString()}` : '';
          return { name: `${a.name.padEnd(6)} ${chalk.dim(pxStr.padStart(12))}`, value: a.name };
        }),
      });
    } else {
      symbol = await input({ message: 'Symbol (e.g. BTC):' });
    }

    const style = await select<string>({
      message: 'Analysis style:',
      choices: [
        { name: 'Scalping (minutes–hours)', value: 'scalping' },
        { name: 'Day Trading (hours–day)', value: 'day-trading' },
        { name: 'Swing Trading (days–weeks)', value: 'swing-trading' },
      ],
    });

    const styleConfig: Record<string, { interval: string; hours: number }> = {
      'scalping': { interval: '5m', hours: 4 },
      'day-trading': { interval: '1h', hours: 24 },
      'swing-trading': { interval: '4h', hours: 24 * 7 },
    };
    const { interval, hours } = styleConfig[style] ?? styleConfig['day-trading'];
    const endTime = Date.now();
    const startTime = endTime - hours * 60 * 60 * 1000;

    const marginInput = await input({ message: 'Margin in USD:', default: '1000' });
    const leverageInput = await input({ message: 'Leverage:', default: '10' });

    const spin = spinner(`Analyzing ${symbol}…`);
    const res = await perpsApi.priceAnalysis(creds.accessToken, {
      symbol,
      startTime,
      endTime,
      interval,
      positionUSD: Number(marginInput),
      leverage: Number(leverageInput),
    });
    spin.stop();

    if (!res.success || !res.data) {
      warn(res.error?.message ?? 'Analysis failed. Try again later.');
      return;
    }

    const data = res.data as Record<string, unknown>;
    console.log('');
    console.log(chalk.bold(`AI Analysis — ${symbol} (${style}):`));
    console.log('');

    if (typeof data === 'string') {
      console.log(data);
    } else {
      printKV(data);
    }
    console.log('');

    // ── Quick Order ──────────────────────────────────────────────────
    // Extract recommendation from the AI response
    const recommendation = extractRecommendation(data, symbol, Number(marginInput), Number(leverageInput));
    if (!recommendation) return;

    const { side, entryPrice, size } = recommendation;
    const sideLabel = side === 'buy' ? chalk.green.bold('LONG') : chalk.red.bold('SHORT');
    console.log(chalk.bold('Quick Order:'));
    console.log(`  ${sideLabel} ${chalk.bold(symbol)}  |  Entry ~$${entryPrice.toLocaleString()}  |  Size ${size}  |  ${Number(leverageInput)}x`);
    console.log('');

    const doQuick = await confirm({ message: 'Place this order now?', default: false });
    if (!doQuick) return;

    const resolved = await resolveWallet(creds.accessToken, opts.wallet, 'Place order on which wallet?');
    if (!resolved) return;
    const { wallet: orderWallet, walletId: orderWalletId } = resolved;

    // Check autopilot for this wallet before placing
    const allStates = await getAllAutopilotStates(creds.accessToken);
    const orderWId = getSubAccountId(orderWallet);
    const orderWStrategies = getAllStrategiesForWallet(allStates, orderWId, !!orderWallet.isDefault);
    const activeAsk = orderWStrategies.find((s) => s.active);
    if (activeAsk) {
      warn(`Autopilot "${strategyDisplayName(activeAsk)}" is ON for "${orderWallet.name ?? 'this wallet'}" — manual orders are disabled.`);
      info('Turn off autopilot first: minara perps autopilot');
      return;
    }

    const isBuy = side === 'buy';
    const slippagePx = isBuy ? entryPrice * 1.01 : entryPrice * 0.99;
    const order: PerpsOrder = {
      a: symbol,
      b: isBuy,
      p: slippagePx.toPrecision(5),
      s: String(size),
      r: false,
      t: { trigger: { triggerPx: String(entryPrice), tpsl: 'tp', isMarket: true } },
    };

    await requireTransactionConfirmation(
      `Perps ${isBuy ? 'LONG' : 'SHORT'} ${symbol} · size ${size} @ ~$${entryPrice.toLocaleString()}`,
    );
    await requireTouchId();

    const orderSpin = spinner('Placing order…');
    const orderRes = await perpsApi.placeOrders(creds.accessToken, { orders: [order], grouping: 'na', subAccountId: orderWalletId });
    orderSpin.stop();
    assertApiOk(orderRes, 'Order placement failed');
    success(`Order submitted on ${getSubAccountLabel(orderWallet)}!`);
    printTxResult(orderRes.data);
  }));

/** Try to extract a tradeable recommendation from the AI analysis response. */
function extractRecommendation(
  data: Record<string, unknown> | string,
  symbol: string,
  marginUSD: number,
  leverage: number,
): { side: 'buy' | 'sell'; entryPrice: number; size: number } | null {
  if (typeof data === 'string') {
    return parseRecommendationText(data, symbol, marginUSD, leverage);
  }

  // Structured response — look for common field names
  const flat = flattenObj(data);

  const sideRaw = String(
    flat['recommendation'] ?? flat['direction'] ?? flat['side'] ?? flat['signal']
    ?? flat['action'] ?? flat['position'] ?? '',
  ).toLowerCase();

  let side: 'buy' | 'sell' | null = null;
  if (/long|buy|bullish/i.test(sideRaw)) side = 'buy';
  else if (/short|sell|bearish/i.test(sideRaw)) side = 'sell';

  if (!side) {
    // Try to infer from the full JSON text
    const jsonStr = JSON.stringify(data).toLowerCase();
    if (/\blong\b|bullish/.test(jsonStr)) side = 'buy';
    else if (/\bshort\b|bearish/.test(jsonStr)) side = 'sell';
  }

  if (!side) return null;

  const entryPrice = Number(
    flat['entryPrice'] ?? flat['entry_price'] ?? flat['entry'] ?? flat['price']
    ?? flat['currentPrice'] ?? flat['current_price'] ?? flat['markPrice'] ?? 0,
  );
  if (!entryPrice || entryPrice <= 0) return null;

  let size = Number(flat['size'] ?? flat['contracts'] ?? flat['qty'] ?? flat['quantity'] ?? 0);
  if (!size || size <= 0) {
    size = parseFloat(((marginUSD * leverage) / entryPrice).toPrecision(4));
  }
  if (!size || size <= 0) return null;

  return { side, entryPrice, size };
}

function parseRecommendationText(
  text: string,
  symbol: string,
  marginUSD: number,
  leverage: number,
): { side: 'buy' | 'sell'; entryPrice: number; size: number } | null {
  let side: 'buy' | 'sell' | null = null;
  if (/\blong\b|bullish|buy/i.test(text)) side = 'buy';
  else if (/\bshort\b|bearish|sell/i.test(text)) side = 'sell';
  if (!side) return null;

  const priceMatch = text.match(/entry[:\s]*\$?([\d,.]+)/i)
    ?? text.match(/price[:\s]*\$?([\d,.]+)/i)
    ?? text.match(/\$\s*([\d,.]+)/);
  const entryPrice = priceMatch ? Number(priceMatch[1].replace(/,/g, '')) : 0;
  if (!entryPrice || entryPrice <= 0) return null;

  const size = parseFloat(((marginUSD * leverage) / entryPrice).toPrecision(4));
  if (!size || size <= 0) return null;

  return { side, entryPrice, size };
}

/** Recursively flatten nested object keys for easier field lookup. */
function flattenObj(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(result, flattenObj(v as Record<string, unknown>, key));
    } else {
      result[k] = v;
      result[key] = v;
    }
  }
  return result;
}

// ═════════════════════════════════════════════════════════════════════════
//  Parent
// ═════════════════════════════════════════════════════════════════════════

export const perpsCommand = new Command('perps')
  .description('Hyperliquid perpetual futures — wallets, order, positions, autopilot, analysis')
  .addCommand(walletsCmd)
  .addCommand(positionsCmd)
  .addCommand(orderCmd)
  .addCommand(cancelCmd)
  .addCommand(closeCmd)
  .addCommand(leverageCmd)
  .addCommand(tradesCmd)
  .addCommand(depositCmd)
  .addCommand(withdrawCmd)
  .addCommand(fundRecordsCmd)
  .addCommand(autopilotCmd)
  .addCommand(askCmd)
  .addCommand(createWalletCmd)
  .addCommand(renameWalletCmd)
  .addCommand(sweepCmd)
  .addCommand(transferCmd)
  .action(wrapAction(async () => {
    const creds = requireAuth();

    // Show autopilot status inline
    const apState = await getAutopilotState(creds.accessToken);
    const apLabel = apState.active ? chalk.green.bold(' [ON]') : chalk.dim(' [OFF]');

    const action = await select({
      message: 'Perps — what would you like to do?',
      choices: [
        { name: 'View wallets', value: 'wallets' },
        { name: 'View positions', value: 'positions' },
        { name: 'Place order', value: 'order' },
        { name: 'Close position', value: 'close' },
        { name: 'Cancel order', value: 'cancel' },
        { name: 'Update leverage', value: 'leverage' },
        { name: 'View trade history', value: 'trades' },
        { name: 'Deposit USDC', value: 'deposit' },
        { name: 'Withdraw USDC', value: 'withdraw' },
        { name: 'Fund records', value: 'fund-records' },
        { name: `Autopilot${apLabel}`, value: 'autopilot' },
        { name: 'Ask AI (long/short analysis)', value: 'ask' },
        { name: chalk.dim('─── Wallet Management ───'), value: '_sep', disabled: true },
        { name: 'Create sub-wallet', value: 'create-wallet' },
        { name: 'Rename sub-wallet', value: 'rename-wallet' },
        { name: 'Sweep funds → default', value: 'sweep' },
        { name: 'Transfer between wallets', value: 'transfer' },
      ],
    });
    const sub = perpsCommand.commands.find((c) => c.name() === action || c.aliases().includes(action));
    if (sub) await sub.parseAsync([], { from: 'user' });
  }));
