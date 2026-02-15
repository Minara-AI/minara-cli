import { Command } from 'commander';
import { input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { transfer } from '../api/crosschain.js';
import { requireAuth } from '../config.js';
import { success, warn, spinner, assertApiOk, selectChain, wrapAction } from '../utils.js';
import { requireTouchId } from '../touchid.js';
import { printTxResult } from '../formatters.js';

export const transferCommand = new Command('transfer')
  .description('Transfer tokens to another address')
  .option('-c, --chain <chain>', 'Blockchain')
  .option('-t, --token <address>', 'Token contract address')
  .option('-a, --amount <amount>', 'Token amount to send')
  .option('--to <address>', 'Recipient address')
  .option('-y, --yes', 'Skip confirmation')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    // ── 1. Chain ─────────────────────────────────────────────────────────
    const chain = opts.chain ?? await selectChain();

    // ── 2. Token ─────────────────────────────────────────────────────────
    const tokenAddress: string = opts.token ?? await input({
      message: 'Token contract address (native token = 0x0…0):',
      validate: (v) => (v.length > 0 ? true : 'Address is required'),
    });

    // ── 3. Amount ────────────────────────────────────────────────────────
    const amount: string = opts.amount ?? await input({
      message: 'Amount to send:',
      validate: (v) => {
        const n = parseFloat(v);
        return (isNaN(n) || n <= 0) ? 'Enter a valid positive number' : true;
      },
    });

    // ── 4. Recipient ─────────────────────────────────────────────────────
    const recipient: string = opts.to ?? await input({
      message: 'Recipient address:',
      validate: (v) => (v.length > 5 ? true : 'Enter a valid address'),
    });

    // ── 5. Summary & confirm ─────────────────────────────────────────────
    console.log('');
    console.log(chalk.bold.red('⚠  Transfer Summary:'));
    console.log(`  Chain     : ${chalk.cyan(chain)}`);
    console.log(`  Token     : ${chalk.yellow(tokenAddress)}`);
    console.log(`  Amount    : ${chalk.bold(amount)}`);
    console.log(`  To        : ${chalk.yellow(recipient)}`);
    console.log('');
    warn('Transfers cannot be reversed. Double-check the recipient address!');

    if (!opts.yes) {
      const confirmed = await confirm({ message: 'Confirm transfer?', default: false });
      if (!confirmed) {
        console.log(chalk.dim('Transfer cancelled.'));
        return;
      }
    }

    // ── 6. Touch ID ──────────────────────────────────────────────────────
    await requireTouchId();

    // ── 7. Execute ───────────────────────────────────────────────────────
    const spin = spinner('Processing transfer…');
    const res = await transfer(creds.accessToken, { chain, tokenAddress, tokenAmount: amount, recipient });
    spin.stop();

    assertApiOk(res, 'Transfer failed');
    success('Transfer submitted!');
    printTxResult(res.data);
  }));
