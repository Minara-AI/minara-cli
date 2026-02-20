import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { exec } from 'node:child_process';
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
        return { symbol: exact.symbol, name: exact.name, address: exact.address ?? tokenInput };
      }
    }

    if (tokens.length === 1) {
      const t = tokens[0];
      return { symbol: t.symbol, name: t.name, address: t.address ?? tokenInput };
    }

    info(`Found ${tokens.length} tokens matching "${tokenInput}"`);
    const selected = await select<typeof tokens[number]>({
      message: 'Select the correct token:',
      choices: tokens.map((t) => ({
        name: `${t.symbol ? chalk.bold('$' + t.symbol) : '?'} — ${t.name ?? 'Unknown'}\n    ${chalk.yellow(t.address ?? '')}`,
        value: t,
      })),
    });
    return {
      symbol: selected.symbol,
      name: selected.name,
      address: selected.address ?? tokenInput,
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
): Promise<void> {
  const config = loadConfig();
  if (config.confirmBeforeTransaction === false) return;

  console.log('');
  console.log(chalk.yellow('⚠'), chalk.bold('Transaction confirmation'));
  if (token) {
    const ticker = token.symbol ? '$' + token.symbol : undefined;
    const label = [ticker, token.name].filter(Boolean).join(' — ');
    console.log(chalk.dim('  Token    : ') + (label ? chalk.bold(label) : chalk.dim('Unknown token')));
    console.log(chalk.dim('  Address  : ') + chalk.yellow(token.address));
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

// ─── Browser ──────────────────────────────────────────────────────────────────

/** Open a URL in the user's default browser (cross-platform). */
export function openBrowser(url: string): void {
  const plat = platform();
  const cmd =
    plat === 'darwin'  ? 'open' :
    plat === 'win32'   ? 'start ""' :
    /* linux / others */ 'xdg-open';

  exec(`${cmd} "${url}"`, (err) => {
    if (err) {
      // Don't crash — the user can manually open the URL
      console.log(chalk.dim(`Could not open browser automatically. Please open this URL manually:`));
      console.log(chalk.cyan(url));
    }
  });
}
