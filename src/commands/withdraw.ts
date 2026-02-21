import { Command } from 'commander';
import { input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { transfer, getAssets } from '../api/crosschain.js';
import { requireAuth } from '../config.js';
import { success, warn, spinner, assertApiOk, selectChain, wrapAction, requireTransactionConfirmation, lookupToken, formatTokenLabel } from '../utils.js';
import { requireTouchId } from '../touchid.js';
import { printTxResult } from '../formatters.js';

export const withdrawCommand = new Command('withdraw')
  .description('Withdraw tokens from your Minara wallet to an external address')
  .option('-c, --chain <chain>', 'Blockchain network')
  .option('-t, --token <address|ticker>', 'Token contract address or ticker symbol')
  .option('-a, --amount <amount>', 'Amount to withdraw')
  .option('--to <address>', 'Destination address')
  .option('-y, --yes', 'Skip confirmation')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    // ── 1. Show current assets for reference ─────────────────────────────
    const assetsSpin = spinner('Fetching your assets…');
    const assetsRes = await getAssets(creds.accessToken);
    assetsSpin.stop();

    if (assetsRes.success && assetsRes.data) {
      const assets = assetsRes.data;
      if (Array.isArray(assets) && assets.length > 0) {
        console.log('');
        console.log(chalk.dim('Your current assets:'));
        for (const asset of assets.slice(0, 15)) {
          const sym = asset.symbol ?? asset.tokenSymbol ?? '';
          const bal = asset.balance ?? asset.amount ?? '';
          const ch = asset.chain ?? asset.chainName ?? '';
          if (sym || bal) {
            console.log(chalk.dim(`  ${sym}  ${bal}  (${ch})`));
          }
        }
        if (assets.length > 15) {
          console.log(chalk.dim(`  … and ${assets.length - 15} more`));
        }
        console.log('');
      }
    }

    // ── 2. Chain ─────────────────────────────────────────────────────────
    const chain = opts.chain ?? await selectChain('Withdraw on which blockchain?');

    // ── 3. Token ─────────────────────────────────────────────────────────
    const tokenInput: string = opts.token ?? await input({
      message: `Token on ${chalk.cyan(chain)} (address or ticker, native = ${'0x' + '0'.repeat(40)}):`,
      validate: (v) => (v.length > 0 ? true : 'Token is required'),
    });
    const tokenInfo = await lookupToken(tokenInput);

    // ── 4. Amount ────────────────────────────────────────────────────────
    const amount: string = opts.amount ?? await input({
      message: 'Amount to withdraw:',
      validate: (v) => {
        const n = parseFloat(v);
        return (isNaN(n) || n <= 0) ? 'Enter a valid positive number' : true;
      },
    });

    // ── 5. Destination ───────────────────────────────────────────────────
    const recipient: string = opts.to ?? await input({
      message: 'Destination address (your external wallet):',
      validate: (v) => (v.length > 5 ? true : 'Enter a valid address'),
    });

    // ── 6. Summary ───────────────────────────────────────────────────────
    console.log('');
    console.log(chalk.bold.red('⚠  Withdrawal Summary'));
    console.log(`  Chain       : ${chalk.cyan(chain)}`);
    console.log(`  Token       : ${formatTokenLabel(tokenInfo)}`);
    console.log(`  Address     : ${chalk.yellow(tokenInfo.address)}`);
    console.log(`  Amount      : ${chalk.bold(amount)}`);
    console.log(`  Destination : ${chalk.yellow(recipient)}`);
    console.log('');
    warn('Withdrawals are irreversible. Please double-check the network and address!');
    warn('Sending to the wrong chain or address will result in permanent loss of funds.');
    console.log('');

    if (!opts.yes) {
      const confirmed = await confirm({
        message: 'I have verified the address and network. Proceed with withdrawal?',
        default: false,
      });
      if (!confirmed) {
        console.log(chalk.dim('Withdrawal cancelled.'));
        return;
      }
    }

    // ── 7. Transaction confirmation & Touch ID ────────────────────────────
    await requireTransactionConfirmation(`Withdraw ${amount} tokens → ${recipient} · ${chain}`, tokenInfo, { chain, amount });
    await requireTouchId();

    // ── 8. Execute ───────────────────────────────────────────────────────
    const spin = spinner('Processing withdrawal…');
    const res = await transfer(creds.accessToken, { chain, tokenAddress: tokenInfo.address, tokenAmount: amount, recipient });
    spin.stop();

    assertApiOk(res, 'Withdrawal failed');

    success('Withdrawal submitted!');
    printTxResult(res.data);
    console.log(chalk.dim('\nIt may take a few minutes for the transaction to be confirmed on-chain.'));
  }));
