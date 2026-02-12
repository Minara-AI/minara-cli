#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';

import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { accountCommand } from './commands/account.js';
import { assetsCommand } from './commands/assets.js';
import { depositCommand } from './commands/deposit.js';
import { withdrawCommand } from './commands/withdraw.js';
import { swapCommand } from './commands/swap.js';
import { transferCommand } from './commands/transfer.js';
import { perpsCommand } from './commands/perps.js';
import { limitOrderCommand } from './commands/limit-order.js';
import { copyTradeCommand } from './commands/copy-trade.js';
import { chatCommand } from './commands/chat.js';
import { discoverCommand } from './commands/discover.js';
import { configCommand } from './commands/config.js';

const program = new Command();

program
  .name('minara')
  .version('0.1.0')
  .description(
    chalk.bold('Minara CLI') +
    ' — Your AI-powered digital finance assistant in the terminal.\n\n' +
    '  Login, swap, trade perps, copy-trade, and chat with Minara AI.'
  );

// ── Auth & Account ───────────────────────────────────────────────────────
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(accountCommand);

// ── Wallet & Funds ───────────────────────────────────────────────────────
program.addCommand(assetsCommand);
program.addCommand(depositCommand);
program.addCommand(withdrawCommand);

// ── Spot Trading ─────────────────────────────────────────────────────────
program.addCommand(swapCommand);
program.addCommand(transferCommand);

// ── Perpetual Futures ────────────────────────────────────────────────────
program.addCommand(perpsCommand);

// ── Bots ─────────────────────────────────────────────────────────────────
program.addCommand(limitOrderCommand);
program.addCommand(copyTradeCommand);

// ── AI Chat ──────────────────────────────────────────────────────────────
program.addCommand(chatCommand);

// ── Market ───────────────────────────────────────────────────────────────
program.addCommand(discoverCommand);

// ── Config ───────────────────────────────────────────────────────────────
program.addCommand(configCommand);

// Default: show help
program.action(() => {
  program.outputHelp();
});

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(chalk.red('Error:'), message);
  process.exit(1);
});
