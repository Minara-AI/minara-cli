import { Command } from 'commander';
import chalk from 'chalk';
import * as perpsApi from '../api/perps.js';
import { get } from '../api/client.js';
import { requireAuth } from '../config.js';
import { spinner, wrapAction } from '../utils.js';
import { printKV, printTable, SPOT_COLUMNS, POSITION_COLUMNS } from '../formatters.js';

// ─── spot ────────────────────────────────────────────────────────────────

const spotCmd = new Command('spot')
  .description('View spot wallet assets across chains')
  .action(wrapAction(async () => {
    const creds = requireAuth();
    await showSpotAssets(creds.accessToken);
  }));

const MIN_DISPLAY_VALUE = 0.01;

async function showSpotAssets(token: string): Promise<void> {
  const spin = spinner('Fetching spot assets…');
  const res = await get<Record<string, unknown>[]>('/users/pnls/all', { token });
  spin.stop();

  if (!res.success || !res.data) {
    console.log('');
    console.log(chalk.bold('Spot Wallet Assets:'));
    console.log(chalk.dim('  Could not fetch spot assets.'));
    if (res.error?.message) console.log(chalk.dim(`  ${res.error.message}`));
    console.log('');
    return;
  }

  const all = res.data as Record<string, unknown>[];
  const holdings: Record<string, unknown>[] = [];
  let totalValue = 0;
  let totalRealizedPnl = 0;
  let totalUnrealizedPnl = 0;
  let hasUnrealizedPnl = false;

  for (const t of all) {
    const bal = Number(t.balance ?? 0);
    const price = Number(t.marketPrice ?? 0);
    const apiVal = Number(t.portfolioValue ?? 0);
    const value = apiVal > 0 ? apiVal : bal * price;
    const uPnl = Number(t.unrealizedPnl ?? 0);
    const rPnl = Number(t.realizedPnl ?? 0);

    totalValue += value;
    totalRealizedPnl += rPnl;
    if (uPnl !== 0) {
      totalUnrealizedPnl += uPnl;
      hasUnrealizedPnl = true;
    }

    if (bal > 0 && value >= MIN_DISPLAY_VALUE) {
      holdings.push({ ...t, _value: value });
    }
  }

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pnlFmt = (n: number) => {
    if (n === 0) return chalk.dim('$0.00');
    const color = n >= 0 ? chalk.green : chalk.red;
    return color(`${n >= 0 ? '+' : ''}${fmt(n)}`);
  };

  console.log('');
  console.log(chalk.bold('Spot Wallet:'));
  console.log(`  Portfolio Value : ${fmt(totalValue)}`);
  console.log(`  Unrealized PnL  : ${pnlFmt(totalUnrealizedPnl)}`);
  console.log(`  Realized PnL    : ${pnlFmt(totalRealizedPnl)}`);

  console.log('');
  console.log(chalk.bold(`Holdings (${holdings.length}):`));

  if (holdings.length === 0) {
    console.log(chalk.dim('  No spot assets with balance.'));
  } else {
    printTable(holdings as object[], SPOT_COLUMNS);
  }
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
  const spin = spinner('Fetching perps wallets…');
  const walletsRes = await perpsApi.listSubAccounts(token);
  spin.stop();

  let wallets: Record<string, unknown>[] = [];
  if (walletsRes.success && walletsRes.data) {
    const raw = walletsRes.data;
    if (Array.isArray(raw)) wallets = raw;
    else if (raw && typeof raw === 'object') {
      const inner = (raw as Record<string, unknown>).data
        ?? (raw as Record<string, unknown>).subAccounts
        ?? (raw as Record<string, unknown>).wallets;
      if (Array.isArray(inner)) wallets = inner;
    }
  }

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pnlFmt = (n: number) => {
    const color = n >= 0 ? chalk.green : chalk.red;
    return color(`${n >= 0 ? '+' : ''}${fmt(n)}`);
  };

  if (wallets.length > 0) {
    console.log('');
    console.log(chalk.bold(`Perps Wallets (${wallets.length}):`));

    for (const w of wallets) {
      const name = String(w.name ?? 'Unnamed');
      const def = w.isDefault ? chalk.cyan(' (default)') : '';

      console.log('');
      console.log(chalk.bold(`  ${name}${def}:`));
      console.log(`    Equity        : ${fmt(Number(w.equityValue ?? 0))}`);
      console.log(`    Available     : ${fmt(Number(w.dispatchableValue ?? 0))}`);
      console.log(`    Margin Used   : ${fmt(Number(w.totalMarginUsed ?? 0))}`);
      console.log(`    Unrealized PnL: ${pnlFmt(Number(w.totalUnrealizedPnl ?? 0))}`);

      const positions = Array.isArray(w.positions) ? w.positions as Record<string, unknown>[] : [];
      if (positions.length > 0) {
        printTable(positions as object[], POSITION_COLUMNS);
      } else {
        console.log(chalk.dim('    No open positions.'));
      }
    }

    // Aggregated summary
    const aggRes = await perpsApi.getAggregatedSummary(token);
    if (aggRes.success && aggRes.data) {
      const d = aggRes.data as Record<string, unknown>;
      console.log('');
      console.log(chalk.bold('  Aggregated:'));
      console.log(`    Total Equity     : ${fmt(Number(d.totalEquity ?? d.equityValue ?? 0))}`);
      console.log(`    Total Unrl. PnL  : ${pnlFmt(Number(d.totalUnrealizedPnl ?? 0))}`);
    }
    console.log('');
    return;
  }

  // Fallback to legacy single-account API
  const legacySpin = spinner('Fetching perps account…');
  const res = await perpsApi.getAccountSummary(token);
  legacySpin.stop();

  if (!res.success || !res.data) {
    console.log(chalk.dim('  Could not fetch perps account.'));
    if (res.error?.message) console.log(chalk.dim(`  ${res.error.message}`));
    return;
  }

  const d = res.data as Record<string, unknown>;

  console.log('');
  console.log(chalk.bold('Perps Account:'));
  console.log(`  Equity        : ${fmt(Number(d.equityValue ?? 0))}`);
  console.log(`  Available     : ${fmt(Number(d.dispatchableValue ?? 0))}`);
  console.log(`  Margin Used   : ${fmt(Number(d.totalMarginUsed ?? 0))}`);
  console.log(`  Unrealized PnL: ${pnlFmt(Number(d.totalUnrealizedPnl ?? 0))}`);
  console.log(`  Withdrawable  : ${fmt(Number(d.withdrawableValue ?? 0))}`);

  const positions = Array.isArray(d.positions) ? d.positions as Record<string, unknown>[] : [];
  console.log('');
  console.log(chalk.bold(`Open Positions (${positions.length}):`));

  if (positions.length === 0) {
    console.log(chalk.dim('  No open positions.'));
  } else {
    printTable(positions as object[], POSITION_COLUMNS);
  }

  console.log('');
}

// ─── parent ──────────────────────────────────────────────────────────────

export const assetsCommand = new Command('assets')
  .description('View your wallet assets (spot & perps)')
  .addCommand(spotCmd)
  .addCommand(perpsCmd)
  .action(wrapAction(async () => {
    const creds = requireAuth();
    await showSpotAssets(creds.accessToken);
    await showPerpsAssets(creds.accessToken);
  }));
