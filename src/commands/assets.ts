import { Command } from 'commander';
import chalk from 'chalk';
import { getAssets } from '../api/crosschain.js';
import { requireAuth } from '../config.js';
import { spinner, unwrapApi, wrapAction } from '../utils.js';

export const assetsCommand = new Command('assets')
  .description('View your wallet assets across chains')
  .action(wrapAction(async () => {
    const creds = requireAuth();
    const spin = spinner('Fetching assets…');
    const res = await getAssets(creds.accessToken);
    spin.stop();

    const data = unwrapApi(res, 'Failed to fetch assets');

    if (Array.isArray(data) && data.length === 0) {
      console.log(chalk.dim('No assets found.'));
      return;
    }

    console.log('');
    console.log(chalk.bold('Your Assets:'));
    console.log(JSON.stringify(data, null, 2));
    console.log('');
  }));
