import { Command } from 'commander';
import { input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { transfer } from '../api/crosschain.js';
import { requireAuth } from '../config.js';
import { success, warn, spinner, assertApiOk, selectChain, wrapAction, requireTransactionConfirmation, lookupToken, formatTokenLabel } from '../utils.js';
import { requireTouchId } from '../touchid.js';
import { printTxResult } from '../formatters.js';

export const transferCommand = new Command('transfer')
  .description('Transfer tokens to another address')
  .option('-c, --chain <chain>', 'Blockchain')
  .option('-t, --token <address|ticker>', 'Token contract address or ticker symbol')
  .option('-a, --amount <amount>', 'Token amount to send')
  .option('--to <address>', 'Recipient address')
  .option('-y, --yes', 'Skip confirmation')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    // ── 1. Chain ─────────────────────────────────────────────────────────
    const chain = opts.chain ?? await selectChain();

    // ── 2. Token ─────────────────────────────────────────────────────────
    const tokenInput: string = opts.token ?? await input({
      message: 'Token (address or ticker, native = 0x0…0):',
      validate: (v) => (v.length > 0 ? true : 'Token is required'),
    });
    const tokenInfo = await lookupToken(tokenInput);

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

    // ── 5. Summary ───────────────────────────────────────────────────────
    console.log('');
    console.log(chalk.bold.red('⚠  Transfer Summary:'));
    console.log(`  Chain     : ${chalk.cyan(chain)}`);
    console.log(`  Token     : ${formatTokenLabel(tokenInfo)}`);
    console.log(`  Address   : ${chalk.yellow(tokenInfo.address)}`);
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

    // ── 6. Transaction confirmation & Touch ID ────────────────────────────
    await requireTransactionConfirmation(`Transfer ${amount} tokens → ${recipient} · ${chain}`, tokenInfo, { chain, amount });
    await requireTouchId();

    // ── 7. Execute ───────────────────────────────────────────────────────
    const spin = spinner('Processing transfer…');
    const res = await transfer(creds.accessToken, { chain, tokenAddress: tokenInfo.address, tokenAmount: amount, recipient });
    spin.stop();

    assertApiOk(res, 'Transfer failed');
    success('Transfer submitted!');
    printTxResult(res.data);
  }));
