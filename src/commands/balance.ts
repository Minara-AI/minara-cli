import { Command } from 'commander';
import chalk from 'chalk';
import { get } from '../api/client.js';
import * as perpsApi from '../api/perps.js';
import { requireAuth } from '../config.js';
import { spinner, wrapAction } from '../utils.js';

const STABLES = new Set(['usdc', 'usdt']);

export const balanceCommand = new Command('balance')
  .description('Show combined USDC / USDT balance across spot and perps')
  .action(wrapAction(async () => {
    const creds = requireAuth();

    const spin = spinner('Fetching balances…');
    const [spotRes, perpsRes] = await Promise.all([
      get<Record<string, unknown>[]>('/users/pnls/all', { token: creds.accessToken }),
      perpsApi.getAccountSummary(creds.accessToken),
    ]);
    spin.stop();

    const fmt = (n: number) =>
      `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    let spotStable = 0;
    if (spotRes.success && Array.isArray(spotRes.data)) {
      for (const t of spotRes.data) {
        const sym = String(t.tokenSymbol ?? '').toLowerCase();
        if (STABLES.has(sym)) {
          const bal = Number(t.balance ?? 0);
          const price = Number(t.marketPrice ?? 1);
          spotStable += bal * price;
        }
      }
    }

    let perpsAvailable = 0;
    if (perpsRes.success && perpsRes.data) {
      const d = perpsRes.data as Record<string, unknown>;
      perpsAvailable = Number(d.dispatchableValue ?? 0);
    }

    const total = spotStable + perpsAvailable;

    console.log('');
    console.log(chalk.bold('Balance:'));
    console.log(`  Spot  (USDC/USDT) : ${fmt(spotStable)}`);
    console.log(`  Perps (available) : ${fmt(perpsAvailable)}`);
    console.log(`  ${'─'.repeat(30)}`);
    console.log(`  Total             : ${chalk.bold(fmt(total))}`);
    console.log('');
  }));
