import { Command } from 'commander';
import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { getAssets } from '../api/crosschain.js';
import * as perpsApi from '../api/perps.js';
import { requireAuth } from '../config.js';
import { spinner, unwrapApi, assertApiOk, wrapAction } from '../utils.js';

// ─── spot ────────────────────────────────────────────────────────────────

const spotCmd = new Command('spot')
  .description('View spot wallet assets across chains')
  .action(wrapAction(async () => {
    const creds = requireAuth();
    await showSpotAssets(creds.accessToken);
  }));

async function showSpotAssets(token: string): Promise<void> {
  const spin = spinner('Fetching spot assets…');
  const res = await getAssets(token);
  spin.stop();

  const data = unwrapApi(res, 'Failed to fetch spot assets');

  if (Array.isArray(data) && data.length === 0) {
    console.log(chalk.dim('No spot assets found.'));
    return;
  }

  console.log('');
  console.log(chalk.bold('Spot Wallet Assets:'));
  console.log(JSON.stringify(data, null, 2));
  console.log('');
}

// ─── perps ───────────────────────────────────────────────────────────────

const perpsCmd = new Command('perps')
  .description('View perps account balance and positions')
  .action(wrapAction(async () => {
    const creds = requireAuth();
    await showPerpsAssets(creds.accessToken);
  }));

async function showPerpsAssets(token: string): Promise<void> {
  // Fetch account state and positions in parallel
  const spin = spinner('Fetching perps account…');
  const [accountRes, positionsRes] = await Promise.all([
    perpsApi.getAccountState(token),
    perpsApi.getPositions(token),
  ]);
  spin.stop();

  // ── Account state ───────────────────────────────────────────────────
  console.log('');
  console.log(chalk.bold('Perps Account:'));

  if (accountRes.success && accountRes.data) {
    console.log(JSON.stringify(accountRes.data, null, 2));
  } else {
    console.log(chalk.dim('  Could not fetch account state.'));
    if (accountRes.error?.message) {
      console.log(chalk.dim(`  ${accountRes.error.message}`));
    }
  }

  // ── Positions ───────────────────────────────────────────────────────
  console.log('');
  console.log(chalk.bold('Open Positions:'));

  if (!positionsRes.success) {
    console.log(chalk.dim('  Could not fetch positions.'));
    if (positionsRes.error?.message) {
      console.log(chalk.dim(`  ${positionsRes.error.message}`));
    }
  } else {
    const positions = positionsRes.data;
    if (!positions || (Array.isArray(positions) && positions.length === 0)) {
      console.log(chalk.dim('  No open positions.'));
    } else {
      console.log(JSON.stringify(positions, null, 2));
    }
  }

  console.log('');
}

// ─── parent ──────────────────────────────────────────────────────────────

export const assetsCommand = new Command('assets')
  .description('View your wallet assets (spot & perps)')
  .addCommand(spotCmd)
  .addCommand(perpsCmd)
  .action(wrapAction(async () => {
    const action = await select({
      message: 'View assets:',
      choices: [
        { name: 'Spot wallet', value: 'spot' },
        { name: 'Perps account', value: 'perps' },
        { name: 'Both', value: 'both' },
      ],
    });

    const creds = requireAuth();

    if (action === 'spot' || action === 'both') {
      await showSpotAssets(creds.accessToken);
    }
    if (action === 'perps' || action === 'both') {
      await showPerpsAssets(creds.accessToken);
    }
  }));
