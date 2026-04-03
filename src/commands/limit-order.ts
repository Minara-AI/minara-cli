import { Command } from 'commander';
import { input, select, confirm, number as numberPrompt } from '@inquirer/prompts';
import chalk from 'chalk';
import * as loApi from '../api/limitorder.js';
import { requireAuth } from '../config.js';
import { success, info, spinner, assertApiOk, selectChain, wrapAction, requireTransactionConfirmation, lookupToken, formatTokenLabel } from '../utils.js';
import { requireTouchId } from '../touchid.js';
import { printTxResult, printTable, LIMIT_ORDER_COLUMNS } from '../formatters.js';

// ─── create ──────────────────────────────────────────────────────────────

const createCmd = new Command('create')
  .description('Create a limit order')
  .option('-y, --yes', 'Skip transaction confirmation (Touch ID still required)')
  .option('--chain <chain>', 'Blockchain (ethereum, base, solana, etc.)')
  .option('--side <side>', 'buy or sell')
  .option('--token <ticker|address>', 'Token symbol or contract address')
  .option('--condition <condition>', 'Price condition (above or below)')
  .option('--price <number>', 'Target price in USD')
  .option('--amount <number>', 'Amount in USD')
  .option('--expiry <hours>', 'Expiry time in hours')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    // Validate all flags upfront before any interactive prompts
    if (opts.side && !['buy', 'sell'].includes(opts.side)) {
      throw new Error(`Invalid side: ${opts.side}. Must be "buy" or "sell".`);
    }
    if (opts.condition && !['above', 'below'].includes(opts.condition)) {
      throw new Error(`Invalid condition: ${opts.condition}. Must be "above" or "below".`);
    }
    if (opts.price !== undefined) {
      const price = parseFloat(opts.price);
      if (isNaN(price) || price <= 0) {
        throw new Error('Target price must be a positive number.');
      }
    }
    if (opts.amount !== undefined) {
      const amountVal = parseFloat(opts.amount);
      if (isNaN(amountVal) || amountVal <= 0) {
        throw new Error('Amount must be a positive number.');
      }
    }
    if (opts.expiry !== undefined) {
      const expiryVal = parseFloat(opts.expiry);
      if (isNaN(expiryVal) || expiryVal <= 0) {
        throw new Error('Expiry must be a positive number of hours.');
      }
    }

    const chain = opts.chain ?? await selectChain('Chain:', true);

    const side = opts.side ?? await select({
      message: 'Side:',
      choices: [
        { name: 'Buy', value: 'buy' },
        { name: 'Sell', value: 'sell' },
      ],
    });

    const tokenInput = opts.token ?? await input({
      message: 'Target token (contract address or ticker):',
      validate: (v) => (v.length > 0 ? true : 'Required'),
    });
    const tokenInfo = await lookupToken(tokenInput);

    const priceCondition = opts.condition ?? await select({
      message: 'Trigger when price is:',
      choices: [
        { name: 'Above target price', value: 'above' },
        { name: 'Below target price', value: 'below' },
      ],
    });

    const targetPrice = opts.price ? parseFloat(opts.price) : await numberPrompt({ message: 'Target price (USD):', required: true });

    const amountInput = opts.amount ?? await input({
      message: 'Amount (USD):',
      validate: (v) => (parseFloat(v) > 0 ? true : 'Enter positive number'),
    });
    const amount = typeof amountInput === 'string' ? amountInput : String(amountInput);

    const expireHours = opts.expiry ? parseFloat(opts.expiry) : await numberPrompt({ message: 'Expire after (hours):', default: 24 });
    const expiredAt = Math.floor(Date.now() / 1000) + (expireHours ?? 24) * 3600;

    console.log('');
    console.log(chalk.bold('Limit Order:'));
    console.log(`  Chain     : ${chalk.cyan(chain)}`);
    console.log(`  Side      : ${side}`);
    console.log(`  Token     : ${formatTokenLabel(tokenInfo)}`);
    console.log(`  Address   : ${chalk.yellow(tokenInfo.address)}`);
    console.log(`  Condition : price ${priceCondition} $${targetPrice}`);
    console.log(`  Amount    : $${amount}`);
    console.log(`  Expires   : ${new Date(expiredAt * 1000).toLocaleString()}`);
    console.log('');

    if (!opts.yes) {
      await requireTransactionConfirmation(`Limit ${side} · $${amount} · price ${priceCondition} $${targetPrice} · ${chain}`, tokenInfo, { chain, side, amount: `$${amount}` });
    }
    await requireTouchId();

    const spin = spinner('Creating limit order…');
    const res = await loApi.createLimitOrder(creds.accessToken, {
      chain, side, amount, targetTokenCA: tokenInfo.address,
      priceCondition, targetPrice: targetPrice!, expiredAt,
    });
    spin.stop();
    assertApiOk(res, 'Failed to create limit order');
    success('Limit order created!');
    printTxResult(res.data);
  }));

// ─── list ────────────────────────────────────────────────────────────────

const listCmd = new Command('list')
  .alias('ls')
  .description('List your limit orders')
  .action(wrapAction(async () => {
    const creds = requireAuth();
    const spin = spinner('Fetching limit orders…');
    const res = await loApi.listLimitOrders(creds.accessToken);
    spin.stop();
    assertApiOk(res, 'Failed to fetch limit orders');

    const orders = res.data;
    if (!orders || orders.length === 0) {
      console.log(chalk.dim('No limit orders.'));
      return;
    }
    console.log('');
    console.log(chalk.bold('Limit Orders:'));
    printTable(orders, LIMIT_ORDER_COLUMNS);
    console.log('');
  }));

// ─── cancel ──────────────────────────────────────────────────────────────

const cancelCmd = new Command('cancel')
  .description('Cancel a limit order')
  .argument('[id]', 'Limit order ID')
  .option('-y, --yes', 'Skip confirmation')
  .action(wrapAction(async (idArg?: string, opts?: { yes?: boolean }) => {
    const creds = requireAuth();

    let id = idArg;
    if (!id) {
      const spin = spinner('Fetching orders…');
      const listRes = await loApi.listLimitOrders(creds.accessToken);
      spin.stop();
      const orders = listRes.data;
      if (!orders || orders.length === 0) { info('No orders to cancel.'); return; }

      id = await select({
        message: 'Select order to cancel:',
        choices: orders.map((o) => ({
          name: `[${o.id.slice(0, 12)}…] ${o.side ?? ''} @ $${o.targetPrice ?? '?'}  status=${o.status ?? '?'}`,
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
    assertApiOk(res, 'Failed to cancel limit order');
    success('Limit order cancelled.');
  }));

// ─── parent ──────────────────────────────────────────────────────────────

export const limitOrderCommand = new Command('limit-order')
  .alias('lo')
  .description('Limit orders — create, list, cancel')
  .addCommand(createCmd)
  .addCommand(listCmd)
  .addCommand(cancelCmd)
  .action(wrapAction(async () => {
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
  }));
