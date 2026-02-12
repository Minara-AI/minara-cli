import { Command } from 'commander';
import { input, select, confirm, number as numberPrompt } from '@inquirer/prompts';
import chalk from 'chalk';
import Table from 'cli-table3';
import * as loApi from '../api/limitorder.js';
import { requireAuth } from '../config.js';
import { success, error, info, spinner } from '../utils.js';
import { SUPPORTED_CHAINS, type Chain } from '../types.js';

// ─── create ──────────────────────────────────────────────────────────────

const createCmd = new Command('create')
  .description('Create a limit order')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (opts) => {
    const creds = requireAuth();

    const chain: Chain = await select({
      message: 'Chain:',
      choices: SUPPORTED_CHAINS.map((c) => ({ name: c, value: c })),
      default: 'solana',
    });

    const side = await select({
      message: 'Side:',
      choices: [
        { name: 'Buy', value: 'buy' },
        { name: 'Sell', value: 'sell' },
      ],
    });

    const targetTokenCA = await input({
      message: 'Target token contract address:',
      validate: (v) => (v.length > 0 ? true : 'Required'),
    });

    const priceCondition = await select({
      message: 'Trigger when price is:',
      choices: [
        { name: 'Above target price', value: 'above' },
        { name: 'Below target price', value: 'below' },
      ],
    });

    const targetPrice = await numberPrompt({ message: 'Target price (USD):', required: true });
    const amount = await input({
      message: 'Amount (USD):',
      validate: (v) => (parseFloat(v) > 0 ? true : 'Enter positive number'),
    });

    const expireHours = await numberPrompt({ message: 'Expire after (hours):', default: 24 });
    const expiredAt = Math.floor(Date.now() / 1000) + (expireHours ?? 24) * 3600;

    console.log('');
    console.log(chalk.bold('Limit Order:'));
    console.log(`  Chain     : ${chalk.cyan(chain)}`);
    console.log(`  Side      : ${side}`);
    console.log(`  Token     : ${chalk.yellow(targetTokenCA)}`);
    console.log(`  Condition : price ${priceCondition} $${targetPrice}`);
    console.log(`  Amount    : $${amount}`);
    console.log(`  Expires   : ${new Date(expiredAt * 1000).toLocaleString()}`);
    console.log('');

    if (!opts.yes) {
      const ok = await confirm({ message: 'Create this limit order?', default: false });
      if (!ok) return;
    }

    const spin = spinner('Creating limit order…');
    const res = await loApi.createLimitOrder(creds.accessToken, {
      chain, side, amount, targetTokenCA,
      priceCondition, targetPrice: targetPrice!, expiredAt,
    });
    spin.stop();
    if (!res.success) { error(res.error?.message ?? 'Failed'); process.exit(1); }
    success('Limit order created!');
    if (res.data) console.log(JSON.stringify(res.data, null, 2));
  });

// ─── list ────────────────────────────────────────────────────────────────

const listCmd = new Command('list')
  .alias('ls')
  .description('List your limit orders')
  .action(async () => {
    const creds = requireAuth();
    const spin = spinner('Fetching limit orders…');
    const res = await loApi.listLimitOrders(creds.accessToken);
    spin.stop();
    if (!res.success) { error(res.error?.message ?? 'Failed'); process.exit(1); }

    const orders = res.data;
    if (!orders || (Array.isArray(orders) && orders.length === 0)) {
      console.log(chalk.dim('No limit orders.'));
      return;
    }
    console.log(JSON.stringify(orders, null, 2));
  });

// ─── cancel ──────────────────────────────────────────────────────────────

const cancelCmd = new Command('cancel')
  .description('Cancel a limit order')
  .argument('[id]', 'Limit order ID')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (idArg?: string, opts?: { yes?: boolean }) => {
    const creds = requireAuth();

    let id = idArg;
    if (!id) {
      // Fetch and let user pick
      const spin = spinner('Fetching orders…');
      const listRes = await loApi.listLimitOrders(creds.accessToken);
      spin.stop();
      const orders = listRes.data as unknown as Array<{ id: string; side?: string; targetPrice?: number; status?: string }>;
      if (!orders || orders.length === 0) { info('No orders to cancel.'); return; }

      id = await select({
        message: 'Select order to cancel:',
        choices: orders.map((o) => ({
          name: `[${o.id?.slice(0, 12)}…] ${o.side ?? ''} @ $${o.targetPrice ?? '?'}  status=${o.status ?? '?'}`,
          value: o.id,
        })),
      });
    }

    if (!opts?.yes) {
      const ok = await confirm({ message: `Cancel order ${id}?`, default: false });
      if (!ok) return;
    }

    const spin = spinner('Cancelling…');
    const res = await loApi.cancelLimitOrder(creds.accessToken, id!);
    spin.stop();
    if (!res.success) { error(res.error?.message ?? 'Failed'); process.exit(1); }
    success('Limit order cancelled.');
  });

// ─── parent ──────────────────────────────────────────────────────────────

export const limitOrderCommand = new Command('limit-order')
  .alias('lo')
  .description('Limit orders — create, list, cancel')
  .addCommand(createCmd)
  .addCommand(listCmd)
  .addCommand(cancelCmd)
  .action(async () => {
    const action = await select({
      message: 'Limit Orders:',
      choices: [
        { name: 'Create a new limit order', value: 'create' },
        { name: 'List orders', value: 'list' },
        { name: 'Cancel an order', value: 'cancel' },
      ],
    });
    const sub = limitOrderCommand.commands.find((c) => c.name() === action);
    if (sub) await sub.parseAsync([], { from: 'user' });
  });
