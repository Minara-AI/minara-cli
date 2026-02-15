import { Command } from 'commander';
import { input, select, confirm, number as numberPrompt } from '@inquirer/prompts';
import chalk from 'chalk';
import * as ctApi from '../api/copytrade.js';
import { requireAuth } from '../config.js';
import { success, info, spinner, assertApiOk, selectChain, wrapAction } from '../utils.js';
import { requireTouchId } from '../touchid.js';
import { printTxResult, printTable, COPY_TRADE_COLUMNS } from '../formatters.js';

// ─── create ──────────────────────────────────────────────────────────────

const createCmd = new Command('create')
  .description('Create a copy trade bot')
  .option('-y, --yes', 'Skip confirmation')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    const chain = await selectChain('Chain:', true);

    const targetAddress = await input({
      message: 'Target wallet address to copy:',
      validate: (v) => (v.length > 5 ? true : 'Enter a valid address'),
    });

    const name = await input({ message: 'Name for this copy trade (optional):' }) || undefined;
    const fixedAmount = await numberPrompt({ message: 'Fixed buy amount (USD) per copy:', min: 1, required: true });
    const copySell = await confirm({ message: 'Also copy sell actions?', default: true });

    let copySellSamePercentage = false;
    let copySellQuitPercentage: number | undefined;
    if (copySell) {
      copySellSamePercentage = await confirm({
        message: 'Copy sell with same percentage as target?',
        default: true,
      });
      copySellQuitPercentage = (await numberPrompt({
        message: 'Clear position alert % (when target sells >= this %, clear your position; 0 to skip):',
        default: 0,
      })) || undefined;
    }

    console.log('');
    console.log(chalk.bold('Copy Trade Bot:'));
    console.log(`  Chain          : ${chalk.cyan(chain)}`);
    console.log(`  Target         : ${chalk.yellow(targetAddress)}`);
    if (name) console.log(`  Name           : ${name}`);
    console.log(`  Buy Amount     : $${fixedAmount}`);
    console.log(`  Copy Sell      : ${copySell ? 'Yes' : 'No'}`);
    if (copySellSamePercentage) console.log(`  Same %         : Yes`);
    if (copySellQuitPercentage) console.log(`  Quit Threshold : ${copySellQuitPercentage}%`);
    console.log('');

    if (!opts.yes) {
      const ok = await confirm({ message: 'Create this copy trade?', default: false });
      if (!ok) return;
    }

    await requireTouchId();

    const spin = spinner('Creating copy trade…');
    const res = await ctApi.createCopyTrade(creds.accessToken, {
      chain, targetAddress, name,
      mode: 'fixedAmount',
      fixedAmount: fixedAmount!,
      copySell,
      copySellSamePercentage,
      copySellQuitPercentage,
    });
    spin.stop();
    assertApiOk(res, 'Failed to create copy trade');
    success('Copy trade created!');
    printTxResult(res.data);
  }));

// ─── list ────────────────────────────────────────────────────────────────

const listCmd = new Command('list')
  .alias('ls')
  .description('List your copy trades')
  .action(wrapAction(async () => {
    const creds = requireAuth();
    const spin = spinner('Fetching copy trades…');
    const res = await ctApi.listCopyTrades(creds.accessToken);
    spin.stop();
    assertApiOk(res, 'Failed to fetch copy trades');

    const data = res.data;
    if (!data || data.length === 0) {
      console.log(chalk.dim('No copy trades.'));
      return;
    }
    console.log('');
    console.log(chalk.bold('Copy Trades:'));
    printTable(data, COPY_TRADE_COLUMNS);
    console.log('');
  }));

// ─── start / stop ────────────────────────────────────────────────────────

async function pickCopyTrade(token: string): Promise<string> {
  const spin = spinner('Fetching copy trades…');
  const res = await ctApi.listCopyTrades(token);
  spin.stop();
  const trades = res.data;
  if (!trades || trades.length === 0) { info('No copy trades found.'); process.exit(0); }
  return select({
    message: 'Select copy trade:',
    choices: trades.map((t) => ({
      name: `[${t.id.slice(0, 12)}…] ${t.name ?? t.targetAddress}  status=${t.status ?? '?'}`,
      value: t.id,
    })),
  });
}

const startCmd = new Command('start')
  .description('Start (resume) a copy trade')
  .argument('[id]', 'Copy trade ID')
  .action(wrapAction(async (idArg?: string) => {
    const creds = requireAuth();
    const id = idArg ?? await pickCopyTrade(creds.accessToken);
    const spin = spinner('Starting…');
    const res = await ctApi.startCopyTrade(creds.accessToken, id);
    spin.stop();
    assertApiOk(res, 'Failed to start copy trade');
    success('Copy trade started.');
  }));

const stopCmd = new Command('stop')
  .description('Stop (pause) a copy trade')
  .argument('[id]', 'Copy trade ID')
  .action(wrapAction(async (idArg?: string) => {
    const creds = requireAuth();
    const id = idArg ?? await pickCopyTrade(creds.accessToken);
    const ok = await confirm({ message: `Stop copy trade ${id.slice(0, 12)}…?`, default: false });
    if (!ok) return;
    const spin = spinner('Stopping…');
    const res = await ctApi.stopCopyTrade(creds.accessToken, id);
    spin.stop();
    assertApiOk(res, 'Failed to stop copy trade');
    success('Copy trade stopped.');
  }));

// ─── delete ──────────────────────────────────────────────────────────────

const deleteCmd = new Command('delete')
  .description('Delete a copy trade')
  .argument('[id]', 'Copy trade ID')
  .option('-y, --yes', 'Skip confirmation')
  .action(wrapAction(async (idArg?: string, opts?: { yes?: boolean }) => {
    const creds = requireAuth();
    const id = idArg ?? await pickCopyTrade(creds.accessToken);
    if (!opts?.yes) {
      const ok = await confirm({ message: `Delete copy trade ${id.slice(0, 12)}…? This cannot be undone.`, default: false });
      if (!ok) return;
    }
    const spin = spinner('Deleting…');
    const res = await ctApi.deleteCopyTrade(creds.accessToken, id);
    spin.stop();
    assertApiOk(res, 'Failed to delete copy trade');
    success('Copy trade deleted.');
  }));

// ─── parent ──────────────────────────────────────────────────────────────

export const copyTradeCommand = new Command('copy-trade')
  .alias('ct')
  .description('Copy trading — follow wallet addresses')
  .addCommand(createCmd)
  .addCommand(listCmd)
  .addCommand(startCmd)
  .addCommand(stopCmd)
  .addCommand(deleteCmd)
  .action(wrapAction(async () => {
    const action = await select({
      message: 'Copy Trade:',
      choices: [
        { name: 'Create a new copy trade', value: 'create' },
        { name: 'List copy trades', value: 'list' },
        { name: 'Start a copy trade', value: 'start' },
        { name: 'Stop a copy trade', value: 'stop' },
        { name: 'Delete a copy trade', value: 'delete' },
      ],
    });
    const sub = copyTradeCommand.commands.find((c) => c.name() === action);
    if (sub) await sub.parseAsync([], { from: 'user' });
  }));
