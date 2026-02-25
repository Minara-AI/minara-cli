import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { select, confirm } from '@inquirer/prompts';
import type { ApiResponse, Chain } from './types.js';
import { SUPPORTED_CHAINS } from './types.js';
import { loadConfig } from './config.js';

// ─── Logging helpers ─────────────────────────────────────────────────────────

export function success(msg: string): void {
  console.log(chalk.green('✔'), msg);
}

export function info(msg: string): void {
  console.log(chalk.blue('ℹ'), msg);
}

export function warn(msg: string): void {
  console.log(chalk.yellow('⚠'), msg);
}

export function error(msg: string): void {
  console.error(chalk.red('✖'), msg);
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

export function spinner(text: string): Ora {
  return ora({ text, color: 'cyan' }).start();
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export function formatAmount(amount: string, currency: string): string {
  return `${amount} ${chalk.bold(currency)}`;
}

export function formatOrderSide(side: string): string {
  return side === 'buy'
    ? chalk.green.bold('BUY')
    : chalk.red.bold('SELL');
}

export function formatOrderStatus(status: string): string {
  switch (status) {
    case 'open':
      return chalk.yellow(status);
    case 'filled':
      return chalk.green(status);
    case 'partially_filled':
      return chalk.blue(status);
    case 'cancelled':
      return chalk.gray(status);
    default:
      return status;
  }
}

export function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

// ─── API error handling ───────────────────────────────────────────────────────

/**
 * Check an API response and exit with a formatted error if it failed.
 * Returns the response data on success (narrowed to non-undefined).
 */
export function unwrapApi<T>(res: ApiResponse<T>, fallbackMsg: string): T {
  if (!res.success || res.data === undefined || res.data === null) {
    error(res.error?.message ?? fallbackMsg);
    process.exit(1);
  }
  return res.data;
}

/**
 * Check an API response for success (data may be void / not needed).
 * Exits on failure.
 */
export function assertApiOk(res: ApiResponse<unknown>, fallbackMsg: string): void {
  if (!res.success) {
    error(res.error?.message ?? fallbackMsg);
    process.exit(1);
  }
}

// ─── Chain selector ───────────────────────────────────────────────────────────

const COMMON_CHAINS: Chain[] = ['solana', 'ethereum', 'base', 'arbitrum', 'bsc', 'polygon', 'optimism', 'avalanche'];

/**
 * Interactive chain selector with common chains first.
 * If `compact` is true, shows all chains in one list.
 */
export async function selectChain(message = 'Select blockchain:', compact = false): Promise<Chain> {
  if (compact) {
    return select({ message, choices: SUPPORTED_CHAINS.map((c) => ({ name: c, value: c })), default: 'solana' });
  }
  const chain = await select({
    message,
    choices: [
      ...COMMON_CHAINS.map((c) => ({ name: c, value: c as string })),
      { name: '── More chains ──', value: '__more__' },
    ],
    default: 'solana',
  });
  if (chain === '__more__') {
    return select({ message: 'Select chain:', choices: SUPPORTED_CHAINS.map((c) => ({ name: c, value: c })) });
  }
  return chain as Chain;
}

// ─── Command wrapper ──────────────────────────────────────────────────────────

/**
 * Wraps a command action handler with a try/catch that catches unexpected
 * errors (network failures, prompt cancellation via Ctrl+C, etc.) and
 * prints a clean error instead of a raw stack trace.
 */
export function wrapAction<A extends unknown[]>(fn: (...args: A) => Promise<void>): (...args: A) => Promise<void> {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (err) {
      // Ctrl+C / prompt close — exit silently
      if (err instanceof Error && (err.message.includes('closed') || err.message.includes('aborted'))) {
        console.log('');
        process.exit(130);
      }
      error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  };
}

// ─── Token lookup ─────────────────────────────────────────────────────────────

export interface TokenDisplayInfo {
  symbol?: string;
  name?: string;
  address: string;
  chain?: string;
}

const NATIVE_TOKEN_ADDRESS: Record<string, string> = {
  sol: 'So11111111111111111111111111111111111111112',
  solana: 'So11111111111111111111111111111111111111112',
};
const EVM_NATIVE = '0x' + '0'.repeat(40);

function resolveNativeAddress(chain?: string): string {
  if (!chain) return EVM_NATIVE;
  return NATIVE_TOKEN_ADDRESS[chain.toLowerCase()] ?? EVM_NATIVE;
}

const CHAIN_ALIAS: Record<string, Chain> = {
  sol: 'solana',
  eth: 'ethereum',
  arb: 'arbitrum',
  op: 'optimism',
  matic: 'polygon',
  poly: 'polygon',
  avax: 'avalanche',
  bnb: 'bsc',
  bera: 'berachain',
  // Numeric chain IDs returned by the token search API
  '101': 'solana',
  '1': 'ethereum',
  '8453': 'base',
  '42161': 'arbitrum',
  '10': 'optimism',
  '56': 'bsc',
  '137': 'polygon',
  '43114': 'avalanche',
  '81457': 'blast',
  '169': 'manta',
  '34443': 'mode',
  '146': 'sonic',
  '80094': 'berachain',
  '196': 'xlayer',
  '4200': 'merlin',
};

/**
 * Normalize a chain identifier from the token search API to a supported
 * `Chain` value used by the swap / transfer APIs.
 */
export function normalizeChain(raw?: string): Chain | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if ((SUPPORTED_CHAINS as readonly string[]).includes(lower)) return lower as Chain;
  return CHAIN_ALIAS[lower];
}

/** Capitalize chain name for display (e.g. "solana" → "Solana", "bsc" → "BSC"). */
function displayChain(raw?: string): string {
  const name = normalizeChain(raw) ?? raw ?? 'unknown';
  if (name === 'bsc') return 'BSC';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Lower = cheaper gas. Used to sort chain choices so the cheapest is first. */
const CHAIN_GAS_RANK: Record<string, number> = {
  sol: 1, solana: 1, '101': 1,
  base: 2, '8453': 2,
  arbitrum: 3, arb: 3, '42161': 3,
  optimism: 4, op: 4, '10': 4,
  bsc: 5, bnb: 5, '56': 5,
  polygon: 6, matic: 6, poly: 6, '137': 6,
  sonic: 7, '146': 7,
  avalanche: 8, avax: 8, '43114': 8,
  berachain: 9, bera: 9, '80094': 9,
  blast: 10, '81457': 10,
  manta: 11, '169': 11,
  mode: 12, '34443': 12,
  ethereum: 50, eth: 50, '1': 50,
};

function chainGasRank(chain?: string): number {
  if (!chain) return 99;
  return CHAIN_GAS_RANK[chain.toLowerCase()] ?? 30;
}

/**
 * Look up token metadata by address, ticker, or name.
 *
 * - Input starting with `$` (e.g. `$BONK`) is treated as an exact ticker
 *   search. Results are filtered to those whose symbol matches (case-insensitive).
 * - Otherwise the raw input is sent to the search API and may match by
 *   address, ticker, or name.
 *
 * When multiple candidates remain the user is prompted to disambiguate.
 * The returned `address` is always the resolved contract address.
 */
export async function lookupToken(tokenInput: string): Promise<TokenDisplayInfo> {
  const isTicker = tokenInput.startsWith('$');
  const keyword = isTicker ? tokenInput.slice(1) : tokenInput;

  const spin = spinner('Looking up token…');
  try {
    const { searchTokens } = await import('./api/tokens.js');
    const res = await searchTokens(keyword);
    spin.stop();

    if (!res.success || !res.data || res.data.length === 0) {
      if (isTicker) {
        warn(`No token found for ticker $${keyword}`);
      }
      return { address: tokenInput };
    }

    let tokens = res.data;

    if (isTicker) {
      const filtered = tokens.filter(
        (t) => t.symbol?.toLowerCase() === keyword.toLowerCase(),
      );
      if (filtered.length > 0) tokens = filtered;
    }

    if (!isTicker) {
      const exact = tokens.find(
        (t) => t.address?.toLowerCase() === keyword.toLowerCase(),
      );
      if (exact) {
        return { symbol: exact.symbol, name: exact.name ?? displayChain(exact.chain), address: exact.address ?? resolveNativeAddress(exact.chain), chain: exact.chain };
      }
    }

    if (tokens.length === 1) {
      const t = tokens[0];
      return { symbol: t.symbol, name: t.name ?? displayChain(t.chain), address: t.address ?? resolveNativeAddress(t.chain), chain: t.chain };
    }

    // Check if all results share the same symbol → multi-chain scenario
    const uniqueSymbols = new Set(tokens.map((t) => t.symbol?.toLowerCase()));
    if (uniqueSymbols.size === 1) {
      const sorted = [...tokens].sort((a, b) => chainGasRank(a.chain) - chainGasRank(b.chain));
      info(`$${sorted[0].symbol} is available on ${sorted.length} chains`);
      const selected = await select<typeof sorted[number]>({
        message: 'Select chain:',
        choices: sorted.map((t, i) => {
          const chainName = displayChain(t.chain);
          const addr = t.address
            ? chalk.dim(` · ${t.address.slice(0, 10)}…${t.address.slice(-6)}`)
            : chalk.dim(' · native token');
          const tag = i === 0 ? chalk.green(' (lowest gas)') : '';
          return { name: `${chalk.cyan(chainName)}${tag}${addr}`, value: t };
        }),
      });
      return {
        symbol: selected.symbol,
        name: selected.name ?? displayChain(selected.chain),
        address: selected.address ?? resolveNativeAddress(selected.chain),
        chain: selected.chain,
      };
    }

    info(`Found ${tokens.length} tokens matching "${tokenInput}"`);
    const selected = await select<typeof tokens[number]>({
      message: 'Select the correct token:',
      choices: tokens.map((t) => {
        const sym = t.symbol ? chalk.bold('$' + t.symbol) : '?';
        const chainName = displayChain(t.chain);
        const label = t.name || chainName;
        const desc = label ? ` — ${label}` : '';
        const chainTag = chainName && chainName !== label ? chalk.dim(` [${chainName}]`) : '';
        const addr = t.address ? `\n    ${chalk.yellow(t.address)}` : chalk.dim('\n    (native token)');
        return { name: `${sym}${desc}${chainTag}${addr}`, value: t };
      }),
    });
    return {
      symbol: selected.symbol,
      name: selected.name ?? displayChain(selected.chain),
      address: selected.address ?? resolveNativeAddress(selected.chain),
      chain: selected.chain,
    };
  } catch {
    spin.stop();
    return { address: tokenInput };
  }
}

/**
 * Format token info for display: "$BONK — Bonk" or just the address when
 * symbol/name are unavailable.
 */
export function formatTokenLabel(token: TokenDisplayInfo): string {
  if (!token.symbol) return chalk.yellow(token.address);
  const ticker = chalk.bold('$' + token.symbol);
  return token.name ? `${ticker} ${chalk.dim('—')} ${token.name}` : ticker;
}

// ─── Transaction confirmation ─────────────────────────────────────────────────

/**
 * Prompt the user for a mandatory second confirmation before executing a
 * fund-related operation. Controlled by `confirmBeforeTransaction` in config
 * (default: enabled). This confirmation is independent of the `-y` flag and
 * Touch ID — it serves as an extra safety net.
 *
 * @param description  Short one-line summary of the operation.
 * @param token        Optional token metadata to highlight in the prompt.
 *
 * Exits the process if the user declines.
 */
export async function requireTransactionConfirmation(
  description: string,
  token?: TokenDisplayInfo,
  details?: { chain?: string; side?: string; amount?: string; destination?: string },
): Promise<void> {
  const config = loadConfig();
  if (config.confirmBeforeTransaction === false) return;

  console.log('');
  console.log(chalk.yellow('⚠'), chalk.bold('Transaction confirmation'));
  if (details?.chain) {
    console.log(chalk.dim('  Chain    : ') + chalk.cyan(details.chain));
  }
  if (token) {
    const ticker = token.symbol ? '$' + token.symbol : undefined;
    const label = [ticker, token.name].filter(Boolean).join(' — ');
    console.log(chalk.dim('  Token    : ') + (label ? chalk.bold(label) : chalk.dim('Unknown token')));
    console.log(chalk.dim('  Address  : ') + chalk.yellow(token.address));
  }
  if (details?.side) {
    const s = details.side.toLowerCase();
    const colored = s === 'buy' ? chalk.green.bold(details.side.toUpperCase()) : chalk.red.bold(details.side.toUpperCase());
    console.log(chalk.dim('  Side     : ') + colored);
  }
  if (details?.amount) {
    console.log(chalk.dim('  Amount   : ') + chalk.bold(details.amount));
  }
  if (details?.destination) {
    console.log(chalk.dim('  To       : ') + chalk.yellow(details.destination));
  }
  console.log(chalk.dim(`  Action   : ${description}`));
  console.log('');

  const ok = await confirm({
    message: 'Are you sure you want to proceed?',
    default: false,
  });
  if (!ok) {
    console.log(chalk.dim('Operation cancelled.'));
    process.exit(0);
  }
}

// ─── Address validation ──────────────────────────────────────────────────────

const SOLANA_ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Validate a blockchain address based on the target chain.
 * Returns `true` on success or an error message string on failure.
 */
export function validateAddress(address: string, chain?: string): true | string {
  const v = address.trim();
  if (!v) return 'Address is required';

  const c = chain?.toLowerCase();
  if (c === 'solana' || c === 'sol' || c === '101') {
    if (!SOLANA_ADDR_RE.test(v)) return 'Invalid Solana address (expected base58, 32–44 chars)';
    return true;
  }
  if (c && c !== 'solana') {
    if (!EVM_ADDR_RE.test(v)) return 'Invalid EVM address (expected 0x + 40 hex chars)';
    return true;
  }
  // Unknown chain — accept either format
  if (!SOLANA_ADDR_RE.test(v) && !EVM_ADDR_RE.test(v)) {
    return 'Invalid address format';
  }
  return true;
}

// ─── Browser ──────────────────────────────────────────────────────────────────

/** Open a URL in the user's default browser (cross-platform). */
export function openBrowser(url: string): void {
  const plat = platform();
  let cmd: string;
  let args: string[];

  if (plat === 'darwin') {
    cmd = 'open';
    args = [url];
  } else if (plat === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '', url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }

  execFile(cmd, args, (err) => {
    if (err) {
      console.log(chalk.dim(`Could not open browser automatically. Please open this URL manually:`));
      console.log(chalk.cyan(url));
    }
  });
}
