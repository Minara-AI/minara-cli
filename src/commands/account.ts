import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentUser } from '../api/auth.js';
import { requireAuth } from '../config.js';
import { spinner, unwrapApi, wrapAction } from '../utils.js';

// Wallets to show by default (user-facing addresses)
const DEFAULT_WALLETS = new Set([
  'abstraction-evm',
  'abstraction-solana',
  'perpetual-evm',
]);

// Descriptions for specific wallet types
const WALLET_DESCRIPTIONS: Record<string, string> = {
  'perpetual-evm': 'Only supports USDC deposits on Arbitrum',
};

export const accountCommand = new Command('account')
  .alias('me')
  .description('View your Minara account info')
  .option('--show-all', 'Show all wallets including internal addresses')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();
    const spin = spinner('Fetching account info…');
    const res = await getCurrentUser(creds.accessToken);
    spin.stop();

    const u = unwrapApi(res, 'Failed to fetch account info');

    console.log('');
    console.log(chalk.bold('Account Info:'));
    if (u.displayName) console.log(`  Name        : ${chalk.cyan(u.displayName)}`);
    if (u.email) console.log(`  Email       : ${chalk.cyan(u.email)}`);
    if (u.username) console.log(`  Username    : ${u.username}`);
    if (u.id) console.log(`  User ID     : ${chalk.dim(u.id)}`);
    if (u.invitationCode) console.log(`  Invite Code : ${u.invitationCode}`);
    if (u.wallets && Object.keys(u.wallets).length > 0) {
      console.log(`  Wallets:`);
      const showAll = opts.showAll === true;
      for (const [type, addr] of Object.entries(u.wallets)) {
        // Filter wallets: only show default wallets unless --show-all is used
        if (showAll || DEFAULT_WALLETS.has(type)) {
          const description = WALLET_DESCRIPTIONS[type];
          if (description) {
            console.log(`    ${chalk.dim(type)} : ${addr} ${chalk.dim(`(${description})`)}`);
          } else {
            console.log(`    ${chalk.dim(type)} : ${addr}`);
          }
        }
      }
    }
    if (u.accounts && Object.keys(u.accounts).length > 0) {
      console.log(`  Linked:`);
      for (const provider of Object.keys(u.accounts)) {
        console.log(`    ${chalk.green('✔')} ${provider}`);
      }
    }
    console.log('');
  }));
