import { Command } from 'commander';
import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import Table from 'cli-table3';
import { getCurrentUser } from '../api/auth.js';
import { getAccount } from '../api/crosschain.js';
import { requireAuth } from '../config.js';
import { info, spinner, unwrapApi, wrapAction } from '../utils.js';
import { printKV } from '../formatters.js';

/**
 * Map wallet type keys from /auth/me → human-readable chain info.
 */
function describeWalletType(key: string): { chains: string[]; network: string } {
  const lower = key.toLowerCase();

  if (lower.includes('evm') || lower === 'spot-evm' || lower === 'abstraction-evm') {
    return {
      network: 'EVM',
      chains: ['Ethereum', 'Base', 'Arbitrum', 'Optimism', 'Polygon', 'Avalanche', 'BSC', 'Berachain', 'Blast'],
    };
  }
  if (lower.includes('solana')) {
    return { network: 'Solana', chains: ['Solana'] };
  }
  return { network: key, chains: [key] };
}

export const depositCommand = new Command('deposit')
  .description('Show your deposit addresses and supported networks')
  .action(wrapAction(async () => {
    const creds = requireAuth();

    const spin = spinner('Fetching deposit addresses…');
    const [userRes, accountRes] = await Promise.all([
      getCurrentUser(creds.accessToken),
      getAccount(creds.accessToken),
    ]);
    spin.stop();

    const user = unwrapApi(userRes, 'Failed to fetch account info');
    const wallets = user.wallets;

    if (!wallets || Object.keys(wallets).length === 0) {
      info('No wallet addresses found. Your account may not have been fully initialized.');
      info('Try logging in at https://minara.ai first, then run this command again.');
      return;
    }

    console.log('');
    console.log(chalk.bold('Deposit Addresses'));
    console.log(chalk.dim('Send tokens to the addresses below. Make sure to use the correct network!'));
    console.log('');

    const table = new Table({
      head: [chalk.white('Network'), chalk.white('Address'), chalk.white('Supported Chains')],
      colWidths: [14, 48, 40],
      wordWrap: true,
    });

    const seen = new Set<string>();
    for (const [walletType, address] of Object.entries(wallets)) {
      if (!address || seen.has(address)) continue;
      seen.add(address);
      const { network, chains } = describeWalletType(walletType);
      table.push([chalk.cyan.bold(network), chalk.yellow(address), chains.join(', ')]);
    }

    console.log(table.toString());

    console.log('');
    console.log(chalk.red.bold('Important:'));
    console.log(chalk.red('  • Only send tokens on the supported chains listed above.'));
    console.log(chalk.red('  • Sending tokens on the wrong network may result in permanent loss.'));
    console.log(chalk.red('  • EVM address supports all EVM-compatible chains (Ethereum, Base, Arbitrum, etc.)'));
    console.log('');

    if (accountRes.success && accountRes.data) {
      const wantDetails = await select({
        message: 'Would you like to see detailed account info?',
        choices: [
          { name: 'Yes', value: true },
          { name: 'No', value: false },
        ],
        default: false,
      });
      if (wantDetails) {
        console.log('');
        console.log(chalk.bold('Account Details:'));
        printKV(accountRes.data as Record<string, unknown>);
        console.log('');
      }
    }
  }));
