import { Command } from 'commander';
import chalk from 'chalk';
import { getAssets } from '../api/crosschain.js';
import { requireAuth } from '../config.js';
import { error, spinner } from '../utils.js';

export const assetsCommand = new Command('assets')
  .description('View your wallet assets across chains')
  .action(async () => {
    const creds = requireAuth();
    const spin = spinner('Fetching assets…');
    const res = await getAssets(creds.accessToken);
    spin.stop();

    if (!res.success || !res.data) {
      error(res.error?.message ?? 'Failed to fetch assets');
      process.exit(1);
    }

    const data = res.data;

    if (Array.isArray(data) && data.length === 0) {
      console.log(chalk.dim('No assets found.'));
      return;
    }

    console.log('');
    console.log(chalk.bold('Your Assets:'));
    console.log(JSON.stringify(data, null, 2));
    console.log('');
  });
