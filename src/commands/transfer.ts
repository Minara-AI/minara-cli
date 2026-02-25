import { Command } from 'commander';
import { input } from '@inquirer/prompts';
import chalk from 'chalk';
import { transfer } from '../api/crosschain.js';
import { requireAuth } from '../config.js';
import { success, spinner, assertApiOk, selectChain, wrapAction, requireTransactionConfirmation, lookupToken, validateAddress } from '../utils.js';
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
      validate: (v) => validateAddress(v, chain),
    });

    // ── 5. Confirm & Touch ID ──────────────────────────────────────────
    if (!opts.yes) {
      await requireTransactionConfirmation(
        `Transfer ${amount} → ${recipient} · ${chain}`,
        tokenInfo,
        { chain, amount, destination: recipient },
      );
    }
    await requireTouchId();

    // ── 7. Execute ───────────────────────────────────────────────────────
    const spin = spinner('Processing transfer…');
    const res = await transfer(creds.accessToken, { chain, tokenAddress: tokenInfo.address, tokenAmount: amount, recipient });
    spin.stop();

    assertApiOk(res, 'Transfer failed');
    success('Transfer submitted!');
    printTxResult(res.data);
  }));
