import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { exec } from 'node:child_process';
import { platform } from 'node:os';
import { select } from '@inquirer/prompts';
import type { ApiResponse, Chain } from './types.js';
import { SUPPORTED_CHAINS } from './types.js';

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
