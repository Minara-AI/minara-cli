#!/usr/bin/env node

import { createRequire } from 'node:module';
import { Command } from 'commander';
import chalk from 'chalk';

import { loginCommand } from './commands/login.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };
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
import { premiumCommand } from './commands/premium.js';
import { setRawJson } from './formatters.js';

const program = new Command();

program
  .name('minara')
  .version(version)
  .option('--json', 'Output raw JSON instead of formatted tables')
  .description(
    chalk.bold('Minara CLI') +
    ' — Your AI-powered digital finance assistant in the terminal.\n\n' +
    '  Login, swap, trade perps, copy-trade, and chat with Minara AI.'
  )
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.optsWithGlobals();
    if (opts.json) setRawJson(true);
  });

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

// ── Premium ─────────────────────────────────────────────────────────────
program.addCommand(premiumCommand);

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
