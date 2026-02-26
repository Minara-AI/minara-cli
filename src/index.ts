#!/usr/bin/env node

import { createRequire } from 'node:module';
import { Command } from 'commander';
import chalk from 'chalk';
import { setRawJson } from './formatters.js';
import { checkForUpdate } from './update-check.js';

// Auth & Account
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { accountCommand } from './commands/account.js';

// Wallet & Funds
import { balanceCommand } from './commands/balance.js';
import { assetsCommand } from './commands/assets.js';
import { depositCommand } from './commands/deposit.js';
import { withdrawCommand } from './commands/withdraw.js';

// Trading
import { swapCommand } from './commands/swap.js';
import { transferCommand } from './commands/transfer.js';
import { perpsCommand } from './commands/perps.js';
import { limitOrderCommand } from './commands/limit-order.js';

// AI, Market, Premium, Config
import { chatCommand } from './commands/chat.js';
import { discoverCommand } from './commands/discover.js';
import { premiumCommand } from './commands/premium.js';
import { configCommand } from './commands/config.js';

// Local Models
import { privateCommand } from './commands/private.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

// Fire update check early (non-blocking); result printed after command completes
const updateCheckPromise = checkForUpdate(version);

const program = new Command();

program
  .name('minara')
  .version(version)
  .option('--json', 'Output raw JSON instead of formatted tables')
  .description(
    chalk.bold('Minara CLI') +
    ' — Your AI-powered digital finance assistant in the terminal.\n\n' +
    '  Login, swap, trade perps, and chat with Minara AI.'
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
program.addCommand(balanceCommand);
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

// ── AI Chat ──────────────────────────────────────────────────────────────
program.addCommand(chatCommand);

// ── Market ───────────────────────────────────────────────────────────────
program.addCommand(discoverCommand);

// ── Premium ─────────────────────────────────────────────────────────────
program.addCommand(premiumCommand);

// ── Config ───────────────────────────────────────────────────────────────
program.addCommand(configCommand);

// ── Local Models ─────────────────────────────────────────────────────────
program.addCommand(privateCommand);

// Default: show help
program.action(() => {
  program.outputHelp();
});

program.parseAsync(process.argv)
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red('Error:'), message);
    process.exit(1);
  })
  .finally(async () => {
    const notice = await updateCheckPromise;
    if (notice) console.log(notice);
  });
