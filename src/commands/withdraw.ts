import { Command } from 'commander';
import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { transfer } from '../api/crosschain.js';
import { getAssets } from '../api/crosschain.js';
import { requireAuth } from '../config.js';
import { success, error, warn, spinner } from '../utils.js';
import { SUPPORTED_CHAINS, type Chain } from '../types.js';

const COMMON_CHAINS: Chain[] = ['solana', 'ethereum', 'base', 'arbitrum', 'bsc', 'polygon', 'optimism', 'avalanche'];

export const withdrawCommand = new Command('withdraw')
  .description('Withdraw tokens from your Minara wallet to an external address')
  .option('-c, --chain <chain>', 'Blockchain network')
  .option('-t, --token <address>', 'Token contract address')
  .option('-a, --amount <amount>', 'Amount to withdraw')
  .option('--to <address>', 'Destination address')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (opts) => {
    const creds = requireAuth();

    // ── 1. Show current assets for reference ─────────────────────────────
    const assetsSpin = spinner('Fetching your assets…');
    const assetsRes = await getAssets(creds.accessToken);
    assetsSpin.stop();

    if (assetsRes.success && assetsRes.data) {
      const data = assetsRes.data;
      if (Array.isArray(data) && data.length > 0) {
        console.log('');
        console.log(chalk.dim('Your current assets:'));
        for (const asset of data.slice(0, 15) as Array<Record<string, unknown>>) {
          const sym = asset.symbol ?? asset.tokenSymbol ?? '';
          const bal = asset.balance ?? asset.amount ?? '';
          const chain = asset.chain ?? asset.chainName ?? '';
          if (sym || bal) {
            console.log(chalk.dim(`  ${sym}  ${bal}  (${chain})`));
          }
        }
        if (Array.isArray(data) && data.length > 15) {
          console.log(chalk.dim(`  … and ${data.length - 15} more`));
        }
        console.log('');
      }
    }

    // ── 2. Chain ─────────────────────────────────────────────────────────
    let chain: Chain = opts.chain;
    if (!chain) {
      chain = await select({
        message: 'Withdraw on which blockchain?',
        choices: [
          ...COMMON_CHAINS.map((c) => ({ name: c, value: c })),
          { name: '── More chains ──', value: '__more__' as Chain },
        ],
        default: 'solana',
      });
      if (chain === '__more__' as Chain) {
        chain = await select({
          message: 'Select chain:',
          choices: SUPPORTED_CHAINS.map((c) => ({ name: c, value: c })),
        });
      }
    }

    // ── 3. Token ─────────────────────────────────────────────────────────
    const tokenAddress: string = opts.token ?? await input({
      message: `Token contract address on ${chalk.cyan(chain)}:\n  (native gas token = ${'0x' + '0'.repeat(40)})\n  Address:`,
      validate: (v) => (v.length > 0 ? true : 'Token address is required'),
    });

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

    // ── 6. Summary & double-confirm ──────────────────────────────────────
    console.log('');
    console.log(chalk.bold.red('⚠  Withdrawal Summary'));
    console.log(`  Chain       : ${chalk.cyan(chain)}`);
    console.log(`  Token       : ${chalk.yellow(tokenAddress)}`);
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

    // ── 7. Execute (withdrawal = cross-chain transfer) ───────────────────
    const spin = spinner('Processing withdrawal…');
    const res = await transfer(creds.accessToken, {
      chain,
      tokenAddress,
      tokenAmount: amount,
      recipient,
    });
    spin.stop();

    if (!res.success) {
      error(res.error?.message ?? 'Withdrawal failed');
      process.exit(1);
    }

    success('Withdrawal submitted!');
    if (res.data) {
      console.log(JSON.stringify(res.data, null, 2));
    }
    console.log(chalk.dim('\nIt may take a few minutes for the transaction to be confirmed on-chain.'));
  });
