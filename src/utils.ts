import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { exec } from 'node:child_process';
import { platform } from 'node:os';

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
