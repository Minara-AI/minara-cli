import { Command } from 'commander';
import { input, select, confirm, number as numberPrompt } from '@inquirer/prompts';
import chalk from 'chalk';
import * as perpsApi from '../api/perps.js';
import { requireAuth } from '../config.js';
import { success, error, info, warn, spinner } from '../utils.js';

// ─── deposit ─────────────────────────────────────────────────────────────

const depositCmd = new Command('deposit')
  .description('Deposit USDC into Hyperliquid perps (min 5 USDC)')
  .option('-a, --amount <amount>', 'USDC amount')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (opts) => {
    const creds = requireAuth();

    const amount = opts.amount
      ? parseFloat(opts.amount)
      : await numberPrompt({
          message: 'USDC amount to deposit (min 5):',
          min: 5,
          required: true,
        });

    if (!amount || amount < 5) { error('Minimum deposit is 5 USDC'); process.exit(1); }

    console.log(`\n  Deposit : ${chalk.bold(amount)} USDC → Perps\n`);
    if (!opts.yes) {
      const ok = await confirm({ message: 'Confirm deposit?', default: true });
      if (!ok) return;
    }

    const spin = spinner('Depositing…');
    const res = await perpsApi.deposit(creds.accessToken, { usdcAmount: amount });
    spin.stop();
    if (!res.success) { error(res.error?.message ?? 'Deposit failed'); process.exit(1); }
    success(`Deposited ${amount} USDC`);
    if (res.data) console.log(JSON.stringify(res.data, null, 2));
  });

// ─── withdraw ────────────────────────────────────────────────────────────

const withdrawCmd = new Command('withdraw')
  .description('Withdraw USDC from Hyperliquid perps')
  .option('-a, --amount <amount>', 'USDC amount')
  .option('--to <address>', 'Destination address')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (opts) => {
    const creds = requireAuth();

    const amount = opts.amount
      ? parseFloat(opts.amount)
      : await numberPrompt({ message: 'USDC amount to withdraw:', min: 0.01, required: true });

    const toAddress: string = opts.to ?? await input({
      message: 'Destination address:',
      validate: (v) => (v.length > 5 ? true : 'Enter a valid address'),
    });

    console.log(`\n  Withdraw : ${chalk.bold(amount)} USDC → ${chalk.yellow(toAddress)}\n`);
    warn('Withdrawals may take time to process.');
    if (!opts.yes) {
      const ok = await confirm({ message: 'Confirm withdrawal?', default: false });
      if (!ok) return;
    }

    const spin = spinner('Withdrawing…');
    const res = await perpsApi.withdraw(creds.accessToken, { usdcAmount: amount!, toAddress });
    spin.stop();
    if (!res.success) { error(res.error?.message ?? 'Withdrawal failed'); process.exit(1); }
    success('Withdrawal submitted');
    if (res.data) console.log(JSON.stringify(res.data, null, 2));
  });

// ─── positions ───────────────────────────────────────────────────────────

const positionsCmd = new Command('positions')
  .alias('pos')
  .description('View all open perps positions')
  .action(async () => {
    const creds = requireAuth();
    const spin = spinner('Fetching positions…');
    const res = await perpsApi.getPositions(creds.accessToken);
    spin.stop();
    if (!res.success) { error(res.error?.message ?? 'Failed'); process.exit(1); }
    console.log(JSON.stringify(res.data, null, 2));
  });

// ─── order ───────────────────────────────────────────────────────────────

const orderCmd = new Command('order')
  .description('Place a perps order')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (opts) => {
    const creds = requireAuth();

    info('Building a Hyperliquid perps order…');

    // Fetch prices for reference
    const pricesSpin = spinner('Fetching token prices…');
    const pricesRes = await perpsApi.getTokenPrices(creds.accessToken);
    pricesSpin.stop();
    if (pricesRes.success && pricesRes.data) {
      console.log(chalk.dim('Current prices:'));
      const pd = pricesRes.data as Record<string, unknown>[];
      if (Array.isArray(pd)) {
        for (const p of pd.slice(0, 10)) {
          console.log(chalk.dim(`  ${JSON.stringify(p)}`));
        }
        if (pd.length > 10) console.log(chalk.dim(`  … and ${pd.length - 10} more`));
      }
    }

    const side = await select({
      message: 'Side:',
      choices: [
        { name: 'Long  (buy)', value: true },
        { name: 'Short (sell)', value: false },
      ],
    });

    const asset = await input({ message: 'Asset symbol (e.g. BTC, ETH):' });

    const orderType = await select({
      message: 'Order type:',
      choices: [
        { name: 'Limit', value: 'limit' },
        { name: 'Market (trigger)', value: 'market' },
      ],
    });

    const limitPx = await input({ message: `Price (${orderType === 'limit' ? 'limit' : 'trigger'}):` });
    const sz = await input({ message: 'Size (in contracts):' });

    const reduceOnly = await confirm({ message: 'Reduce only?', default: false });

    const grouping = await select({
      message: 'Grouping (TP/SL):',
      choices: [
        { name: 'None', value: 'na' as const },
        { name: 'Normal TP/SL', value: 'normalTpsl' as const },
        { name: 'Position TP/SL', value: 'positionTpsl' as const },
      ],
    });

    const order: Record<string, unknown> = {
      a: asset,         // asset (symbol index may differ, API-dependent)
      b: side,          // isBuy
      p: limitPx,       // limitPx
      s: sz,            // sz
      r: reduceOnly,    // reduceOnly
      t: orderType === 'limit'
        ? { limit: { tif: 'Gtc' } }
        : { trigger: { triggerPx: limitPx, tpsl: 'tp', isMarket: true } },
    };

    console.log('');
    console.log(chalk.bold('Order Preview:'));
    console.log(JSON.stringify(order, null, 2));
    console.log('');

    if (!opts.yes) {
      const ok = await confirm({ message: 'Submit order?', default: false });
      if (!ok) { console.log(chalk.dim('Cancelled.')); return; }
    }

    const spin = spinner('Placing order…');
    const res = await perpsApi.placeOrders(creds.accessToken, { orders: [order], grouping });
    spin.stop();
    if (!res.success) { error(res.error?.message ?? 'Order failed'); process.exit(1); }
    success('Order submitted!');
    if (res.data) console.log(JSON.stringify(res.data, null, 2));
  });

// ─── cancel ──────────────────────────────────────────────────────────────

const cancelCmd = new Command('cancel')
  .description('Cancel perps orders')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (opts) => {
    const creds = requireAuth();

    const asset = await input({ message: 'Asset symbol to cancel (e.g. BTC):' });
    const oid = await input({ message: 'Order ID (oid):' });

    const cancel: Record<string, unknown> = { a: asset, o: parseInt(oid, 10) };

    if (!opts.yes) {
      const ok = await confirm({ message: `Cancel order ${oid} for ${asset}?`, default: false });
      if (!ok) return;
    }

    const spin = spinner('Cancelling…');
    const res = await perpsApi.cancelOrders(creds.accessToken, { cancels: [cancel] });
    spin.stop();
    if (!res.success) { error(res.error?.message ?? 'Cancel failed'); process.exit(1); }
    success('Order cancelled');
    if (res.data) console.log(JSON.stringify(res.data, null, 2));
  });

// ─── leverage ────────────────────────────────────────────────────────────

const leverageCmd = new Command('leverage')
  .description('Update leverage for a symbol')
  .action(async () => {
    const creds = requireAuth();

    const symbol = await input({ message: 'Symbol (e.g. BTC):' });
    const leverage = await numberPrompt({ message: 'Leverage:', min: 1, max: 100, required: true });
    const mode = await select({
      message: 'Margin mode:',
      choices: [
        { name: 'Cross', value: true },
        { name: 'Isolated', value: false },
      ],
    });

    const spin = spinner('Updating leverage…');
    const res = await perpsApi.updateLeverage(creds.accessToken, {
      symbol, isCross: mode, leverage: leverage!,
    });
    spin.stop();
    if (!res.success) { error(res.error?.message ?? 'Failed'); process.exit(1); }
    success(`Leverage set to ${leverage}x (${mode ? 'cross' : 'isolated'}) for ${symbol}`);
  });

// ─── trades ──────────────────────────────────────────────────────────────

const tradesCmd = new Command('trades')
  .description('View completed perps trades')
  .action(async () => {
    const creds = requireAuth();
    const spin = spinner('Fetching trades…');
    const res = await perpsApi.getCompletedTrades(creds.accessToken);
    spin.stop();
    if (!res.success) { error(res.error?.message ?? 'Failed'); process.exit(1); }
    console.log(JSON.stringify(res.data, null, 2));
  });

// ─── fund-records ────────────────────────────────────────────────────────

const fundRecordsCmd = new Command('fund-records')
  .description('View perps fund deposit/withdraw records')
  .option('-p, --page <n>', 'Page', '1')
  .option('-l, --limit <n>', 'Limit', '20')
  .action(async (opts) => {
    const creds = requireAuth();
    const spin = spinner('Fetching records…');
    const res = await perpsApi.getFundRecords(creds.accessToken, parseInt(opts.page), parseInt(opts.limit));
    spin.stop();
    if (!res.success) { error(res.error?.message ?? 'Failed'); process.exit(1); }
    console.log(JSON.stringify(res.data, null, 2));
  });

// ═════════════════════════════════════════════════════════════════════════
//  Parent
// ═════════════════════════════════════════════════════════════════════════

export const perpsCommand = new Command('perps')
  .description('Hyperliquid perpetual futures — deposit, withdraw, order, positions')
  .addCommand(depositCmd)
  .addCommand(withdrawCmd)
  .addCommand(positionsCmd)
  .addCommand(orderCmd)
  .addCommand(cancelCmd)
  .addCommand(leverageCmd)
  .addCommand(tradesCmd)
  .addCommand(fundRecordsCmd)
  .action(async () => {
    const action = await select({
      message: 'Perps — what would you like to do?',
      choices: [
        { name: 'Deposit USDC', value: 'deposit' },
        { name: 'Withdraw USDC', value: 'withdraw' },
        { name: 'Place order', value: 'order' },
        { name: 'Cancel order', value: 'cancel' },
        { name: 'View positions', value: 'positions' },
        { name: 'Update leverage', value: 'leverage' },
        { name: 'View completed trades', value: 'trades' },
        { name: 'Fund records', value: 'fund-records' },
      ],
    });
    const sub = perpsCommand.commands.find((c) => c.name() === action || c.aliases().includes(action));
    if (sub) await sub.parseAsync([], { from: 'user' });
  });
