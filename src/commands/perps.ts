import { Command } from 'commander';
import { input, select, confirm, number as numberPrompt } from '@inquirer/prompts';
import chalk from 'chalk';
import * as perpsApi from '../api/perps.js';
import { requireAuth } from '../config.js';
import { success, info, warn, spinner, assertApiOk, formatOrderSide, wrapAction, requireTransactionConfirmation } from '../utils.js';
import { requireTouchId } from '../touchid.js';
import { printTxResult, printTable, printKV, POSITION_COLUMNS, FILL_COLUMNS } from '../formatters.js';
import type { PerpsOrder } from '../types.js';

// ─── deposit ─────────────────────────────────────────────────────────────

const depositCmd = new Command('deposit')
  .description('Deposit USDC into Hyperliquid perps (min 5 USDC)')
  .option('-a, --amount <amount>', 'USDC amount')
  .option('-y, --yes', 'Skip confirmation')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    const amount = opts.amount
      ? parseFloat(opts.amount)
      : await numberPrompt({ message: 'USDC amount to deposit (min 5):', min: 5, required: true });

    if (!amount || amount < 5) {
      console.error(chalk.red('✖'), 'Minimum deposit is 5 USDC');
      process.exit(1);
    }

    console.log(`\n  Deposit : ${chalk.bold(amount)} USDC → Perps\n`);
    if (!opts.yes) {
      const ok = await confirm({ message: 'Confirm deposit?', default: true });
      if (!ok) return;
    }

    await requireTransactionConfirmation(`Deposit ${amount} USDC → Perps`);
    await requireTouchId();

    const spin = spinner('Depositing…');
    const res = await perpsApi.deposit(creds.accessToken, { usdcAmount: amount });
    spin.stop();
    assertApiOk(res, 'Deposit failed');
    success(`Deposited ${amount} USDC`);
    printTxResult(res.data);
  }));

// ─── withdraw ────────────────────────────────────────────────────────────

const withdrawCmd = new Command('withdraw')
  .description('Withdraw USDC from Hyperliquid perps')
  .option('-a, --amount <amount>', 'USDC amount')
  .option('--to <address>', 'Destination address')
  .option('-y, --yes', 'Skip confirmation')
  .action(wrapAction(async (opts) => {
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

    await requireTransactionConfirmation(`Withdraw ${amount} USDC → ${toAddress}`);
    await requireTouchId();

    const spin = spinner('Withdrawing…');
    const res = await perpsApi.withdraw(creds.accessToken, { usdcAmount: amount!, toAddress });
    spin.stop();
    assertApiOk(res, 'Withdrawal failed');
    success('Withdrawal submitted');
    printTxResult(res.data);
  }));

// ─── positions ───────────────────────────────────────────────────────────

const positionsCmd = new Command('positions')
  .alias('pos')
  .description('View all open perps positions')
  .action(wrapAction(async () => {
    const creds = requireAuth();
    const spin = spinner('Fetching positions…');
    const res = await perpsApi.getAccountSummary(creds.accessToken);
    spin.stop();

    if (!res.success || !res.data) {
      console.log(chalk.dim('Could not fetch positions.'));
      if (res.error?.message) console.log(chalk.dim(`  ${res.error.message}`));
      return;
    }

    const d = res.data as Record<string, unknown>;
    const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const pnlFmt = (n: number) => {
      const color = n >= 0 ? chalk.green : chalk.red;
      return color(`${n >= 0 ? '+' : ''}${fmt(n)}`);
    };

    console.log('');
    console.log(`  Equity        : ${fmt(Number(d.equityValue ?? 0))}`);
    console.log(`  Unrealized PnL: ${pnlFmt(Number(d.totalUnrealizedPnl ?? 0))}`);
    console.log(`  Margin Used   : ${fmt(Number(d.totalMarginUsed ?? 0))}`);

    const positions = Array.isArray(d.positions) ? d.positions as Record<string, unknown>[] : [];
    console.log('');
    console.log(chalk.bold(`Open Positions (${positions.length}):`));

    if (positions.length === 0) {
      console.log(chalk.dim('  No open positions.'));
    } else {
      printTable(positions as object[], POSITION_COLUMNS);
    }
    console.log('');
  }));

// ─── order ───────────────────────────────────────────────────────────────

const orderCmd = new Command('order')
  .description('Place a perps order')
  .option('-y, --yes', 'Skip confirmation')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    // Check autopilot — block manual orders while AI is trading
    const apSpin = spinner('Checking autopilot…');
    const apState = await getAutopilotState(creds.accessToken);
    apSpin.stop();
    if (apState.active) {
      console.log('');
      warn('Autopilot is currently ON. Manual order placement is disabled while AI is trading.');
      info(`Trading symbols: ${apState.symbols?.join(', ') ?? 'unknown'}`);
      info('Turn off autopilot first: minara perps autopilot');
      console.log('');
      return;
    }

    info('Building a Hyperliquid perps order…');

    const dataSpin = spinner('Fetching market data…');
    const address = await perpsApi.getPerpsAddress(creds.accessToken);
    const [assets, leverages] = await Promise.all([
      perpsApi.getAssetMeta(),
      address ? perpsApi.getUserLeverage(address) : Promise.resolve([]),
    ]);
    dataSpin.stop();

    const leverageMap = new Map<string, { value: number; type: string }>();
    for (const l of leverages) {
      leverageMap.set(l.coin.toUpperCase(), { value: l.leverageValue, type: l.leverageType });
    }

    const isBuy = await select({
      message: 'Side:',
      choices: [
        { name: 'Long  (buy)', value: true },
        { name: 'Short (sell)', value: false },
      ],
    });

    let asset: string;
    if (assets.length > 0) {
      asset = await select({
        message: 'Asset:',
        choices: assets.map((a) => {
          const pxStr = a.markPx > 0 ? `$${a.markPx.toLocaleString()}` : '';
          const lev = leverageMap.get(a.name.toUpperCase());
          const levStr = lev ? `${lev.value}x ${lev.type}` : '';
          return {
            name: `${a.name.padEnd(6)} ${chalk.dim(pxStr.padStart(12))}  ${chalk.dim(`max ${a.maxLeverage}x`)}${levStr ? `  ${chalk.cyan(levStr)}` : ''}`,
            value: a.name,
          };
        }),
      });
    } else {
      asset = await input({ message: 'Asset symbol (e.g. BTC, ETH):' });
    }

    const currentLev = leverageMap.get(asset.toUpperCase());
    if (currentLev) {
      info(`Current leverage: ${currentLev.value}x (${currentLev.type})`);
    } else {
      info(`No leverage set for ${asset} — use 'minara perps leverage' to configure`);
    }

    const orderType = await select({
      message: 'Order type:',
      choices: [
        { name: 'Market', value: 'market' as const },
        { name: 'Limit', value: 'limit' as const },
      ],
    });

    const assetMeta = assets.find((a) => a.name.toUpperCase() === asset.toUpperCase());
    let limitPx: string;
    let marketPx: number | undefined;
    if (orderType === 'limit') {
      limitPx = await input({ message: 'Limit price:' });
    } else {
      marketPx = assetMeta?.markPx;
      if (marketPx && marketPx > 0) {
        const slippagePx = isBuy ? marketPx * 1.01 : marketPx * 0.99;
        limitPx = slippagePx.toPrecision(6);
        info(`Market order at ~$${marketPx}`);
      } else {
        warn(`Could not fetch current price for ${asset}. Enter the approximate market price.`);
        limitPx = await input({ message: 'Price:' });
        marketPx = Number(limitPx);
      }
    }

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

    const order: PerpsOrder = {
      a: asset,
      b: isBuy,
      p: limitPx,
      s: sz,
      r: reduceOnly,
      t: orderType === 'limit'
        ? { limit: { tif: 'Gtc' } }
        : { trigger: { triggerPx: String(marketPx ?? limitPx), tpsl: 'tp', isMarket: true } },
    };

    const priceLabel = orderType === 'market' ? `Market (~$${marketPx ?? limitPx})` : `$${limitPx}`;

    const levLabel = currentLev ? `${currentLev.value}x (${currentLev.type})` : '—';

    console.log('');
    console.log(chalk.bold('Order Preview:'));
    console.log(`  Asset        : ${chalk.bold(order.a)}`);
    console.log(`  Side         : ${formatOrderSide(order.b ? 'buy' : 'sell')}`);
    console.log(`  Leverage     : ${chalk.cyan(levLabel)}`);
    console.log(`  Type         : ${orderType === 'market' ? 'Market' : 'Limit (GTC)'}`);
    console.log(`  Price        : ${chalk.yellow(priceLabel)}`);
    console.log(`  Size         : ${chalk.bold(order.s)}`);
    console.log(`  Reduce Only  : ${order.r ? chalk.yellow('Yes') : 'No'}`);
    console.log(`  Grouping     : ${grouping}`);
    console.log('');

    if (!opts.yes) {
      await requireTransactionConfirmation(`Perps ${order.b ? 'LONG' : 'SHORT'} ${order.a} · size ${order.s} @ ${priceLabel}`);
    }
    await requireTouchId();

    const spin = spinner('Placing order…');
    const res = await perpsApi.placeOrders(creds.accessToken, { orders: [order], grouping });
    spin.stop();
    assertApiOk(res, 'Order placement failed');
    success('Order submitted!');
    printTxResult(res.data);
  }));

// ─── cancel ──────────────────────────────────────────────────────────────

const cancelCmd = new Command('cancel')
  .description('Cancel perps orders')
  .option('-y, --yes', 'Skip confirmation')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    const metaSpin = spinner('Fetching assets…');
    const assets = await perpsApi.getAssetMeta();
    metaSpin.stop();

    let asset: string;
    if (assets.length > 0) {
      asset = await select({
        message: 'Asset to cancel:',
        choices: assets.map((a) => {
          const pxStr = a.markPx > 0 ? `$${a.markPx.toLocaleString()}` : '';
          return {
            name: `${a.name.padEnd(6)} ${chalk.dim(pxStr.padStart(12))}  ${chalk.dim(`max ${a.maxLeverage}x`)}`,
            value: a.name,
          };
        }),
      });
    } else {
      asset = await input({ message: 'Asset symbol to cancel (e.g. BTC):' });
    }

    const oid = await input({
      message: 'Order ID (oid):',
      validate: (v) => {
        const n = parseInt(v, 10);
        return isNaN(n) ? 'Please enter a valid numeric order ID' : true;
      },
    });

    if (!opts.yes) {
      const ok = await confirm({ message: `Cancel order ${oid} for ${asset}?`, default: false });
      if (!ok) return;
    }

    const spin = spinner('Cancelling…');
    const res = await perpsApi.cancelOrders(creds.accessToken, { cancels: [{ a: asset, o: parseInt(oid, 10) }] });
    spin.stop();
    assertApiOk(res, 'Order cancellation failed');
    success('Order cancelled');
    printTxResult(res.data);
  }));

// ─── leverage ────────────────────────────────────────────────────────────

const leverageCmd = new Command('leverage')
  .description('Update leverage for a symbol')
  .action(wrapAction(async () => {
    const creds = requireAuth();

    const metaSpin = spinner('Fetching available assets…');
    const assets = await perpsApi.getAssetMeta();
    metaSpin.stop();

    let symbol: string;
    if (assets.length > 0) {
      symbol = await select({
        message: 'Asset:',
        choices: assets.map((a) => {
          const pxStr = a.markPx > 0 ? `$${a.markPx.toLocaleString()}` : '';
          return {
            name: `${a.name.padEnd(6)} ${chalk.dim(pxStr.padStart(12))}  ${chalk.dim(`max ${a.maxLeverage}x`)}`,
            value: a.name,
          };
        }),
      });
    } else {
      symbol = await input({ message: 'Symbol (e.g. BTC):' });
    }

    const meta = assets.find((a) => a.name.toUpperCase() === symbol.toUpperCase());
    const maxLev = meta?.maxLeverage ?? 50;

    const leverage = await numberPrompt({
      message: `Leverage (1–${maxLev}x):`,
      min: 1,
      max: maxLev,
      required: true,
    });

    const isCross = await select({
      message: 'Margin mode:',
      choices: [
        { name: 'Cross', value: true },
        { name: 'Isolated', value: false },
      ],
    });

    const spin = spinner('Updating leverage…');
    const res = await perpsApi.updateLeverage(creds.accessToken, { symbol, isCross, leverage: leverage! });
    spin.stop();
    assertApiOk(res, 'Failed to update leverage');
    success(`Leverage set to ${leverage}x (${isCross ? 'cross' : 'isolated'}) for ${symbol}`);
  }));

// ─── trades ──────────────────────────────────────────────────────────────

const tradesCmd = new Command('trades')
  .description('View your perps trade fills')
  .option('-n, --count <n>', 'Number of recent fills to show', '20')
  .option('-d, --days <n>', 'Look back N days', '7')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    const spin = spinner('Fetching trade history…');
    const address = await perpsApi.getPerpsAddress(creds.accessToken);
    if (!address) {
      spin.stop();
      warn('Could not find your perps wallet address. Make sure your perps account is initialized.');
      return;
    }

    const days = Math.max(1, parseInt(opts.days, 10) || 7);
    const fills = await perpsApi.getUserFills(address, days);
    spin.stop();

    const limit = Math.max(1, parseInt(opts.count, 10) || 20);
    const recent = fills.slice(0, limit);

    const totalPnl = fills.reduce((s, f) => s + Number(f.closedPnl ?? 0), 0);
    const totalFees = fills.reduce((s, f) => s + Number(f.fee ?? 0), 0);
    const closingFills = fills.filter((f) => Number(f.closedPnl ?? 0) !== 0);
    const wins = closingFills.filter((f) => Number(f.closedPnl) > 0).length;
    const pnlColor = totalPnl >= 0 ? chalk.green : chalk.red;
    const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    console.log('');
    console.log(chalk.bold(`Trade Fills (last ${days}d — ${fills.length} fills):`));
    console.log(`  Realized PnL : ${pnlColor(`${totalPnl >= 0 ? '+' : ''}${fmt(totalPnl)}`)}`);
    console.log(`  Total Fees   : ${chalk.dim(fmt(totalFees))}`);
    if (closingFills.length > 0) {
      console.log(`  Win Rate     : ${wins}/${closingFills.length} (${((wins / closingFills.length) * 100).toFixed(1)}%)`);
    }
    console.log('');

    if (recent.length > 0) {
      console.log(chalk.dim(`Showing ${recent.length} most recent:`));
      printTable(recent as unknown as Record<string, unknown>[], FILL_COLUMNS);
    } else {
      console.log(chalk.dim('  No trade fills in this period.'));
    }
    console.log('');
  }));

// ─── fund-records ────────────────────────────────────────────────────────

const fundRecordsCmd = new Command('fund-records')
  .description('View perps fund deposit/withdraw records')
  .option('-p, --page <n>', 'Page', '1')
  .option('-l, --limit <n>', 'Limit', '20')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();
    const spin = spinner('Fetching records…');
    const res = await perpsApi.getFundRecords(creds.accessToken, parseInt(opts.page, 10), parseInt(opts.limit, 10));
    spin.stop();
    assertApiOk(res, 'Failed to fetch fund records');

    console.log('');
    console.log(chalk.bold('Fund Records:'));
    if (Array.isArray(res.data) && res.data.length > 0) {
      printTable(res.data as Record<string, unknown>[]);
    } else {
      console.log(chalk.dim('  No fund records.'));
    }
    console.log('');
  }));

// ─── autopilot helpers ───────────────────────────────────────────────────

interface AutopilotState {
  active: boolean;
  strategyId?: string;
  symbols?: string[];
}

async function getAutopilotState(token: string): Promise<AutopilotState> {
  const res = await perpsApi.getStrategies(token);
  if (!res.success || !res.data) return { active: false };

  // Response may be an array or { data: [...] } or nested object
  let strategies: Record<string, unknown>[] = [];
  const raw = res.data;
  if (Array.isArray(raw)) {
    strategies = raw as Record<string, unknown>[];
  } else if (raw && typeof raw === 'object') {
    // Might be wrapped in { strategies: [...] } or { data: [...] }
    const inner = (raw as Record<string, unknown>).strategies
      ?? (raw as Record<string, unknown>).data
      ?? raw;
    if (Array.isArray(inner)) {
      strategies = inner as Record<string, unknown>[];
    } else {
      for (const v of Object.values(raw as Record<string, unknown>)) {
        if (Array.isArray(v)) { strategies.push(...(v as Record<string, unknown>[])); break; }
      }
    }
  }

  if (strategies.length === 0) return { active: false };

  const s = strategies[0] as Record<string, unknown>;
  // Check all possible status field names
  const status = String(
    s.status ?? s.state ?? s.isActive ?? s.enabled ?? '',
  ).toLowerCase();
  const isActive = status === 'active' || status === 'enabled' || status === 'running'
    || status === 'true' || s.isActive === true || s.enabled === true;

  return {
    active: isActive,
    strategyId: String(s._id ?? s.id ?? s.strategyId ?? ''),
    symbols: Array.isArray(s.symbols) ? s.symbols as string[] : [],
  };
}

// ─── autopilot ──────────────────────────────────────────────────────────

const autopilotCmd = new Command('autopilot')
  .alias('ap')
  .description('Manage AI autopilot trading strategy')
  .action(wrapAction(async () => {
    const creds = requireAuth();

    const statusSpin = spinner('Checking autopilot status…');
    const state = await getAutopilotState(creds.accessToken);
    statusSpin.stop();

    const statusLabel = state.active ? chalk.green.bold('ON') : chalk.dim('OFF');
    console.log('');
    console.log(chalk.bold('Autopilot Status:') + ` ${statusLabel}`);
    if (state.symbols && state.symbols.length > 0) {
      console.log(`  Symbols : ${state.symbols.join(', ')}`);
    }
    console.log('');

    const action = await select({
      message: 'What would you like to do?',
      choices: [
        ...(state.active
          ? [{ name: chalk.red('Turn OFF autopilot'), value: 'off' as const }]
          : [{ name: chalk.green('Turn ON autopilot'), value: 'on' as const }]),
        ...(!state.strategyId ? [{ name: 'Create autopilot strategy', value: 'create' as const }] : []),
        ...(state.strategyId ? [{ name: 'Update symbols', value: 'update' as const }] : []),
        { name: 'View performance', value: 'perf' as const },
        { name: 'Back', value: 'back' as const },
      ],
    });

    if (action === 'back') return;

    if (action === 'on' && state.strategyId) {
      const spin = spinner('Enabling autopilot…');
      const res = await perpsApi.enableStrategy(creds.accessToken, state.strategyId);
      spin.stop();
      assertApiOk(res, 'Failed to enable autopilot');
      success('Autopilot is now ON');
      return;
    }

    if (action === 'off' && state.strategyId) {
      const ok = await confirm({ message: 'Turn off autopilot? AI will stop trading.', default: false });
      if (!ok) return;
      const spin = spinner('Disabling autopilot…');
      const res = await perpsApi.disableStrategy(creds.accessToken, state.strategyId);
      spin.stop();
      assertApiOk(res, 'Failed to disable autopilot');
      success('Autopilot is now OFF');
      return;
    }

    if (action === 'create' || (action === 'on' && !state.strategyId)) {
      const symSpin = spinner('Fetching supported symbols…');
      const symRes = await perpsApi.getSupportedSymbols(creds.accessToken);
      symSpin.stop();
      const supported = symRes.success && Array.isArray(symRes.data) ? symRes.data as string[] : ['BTC', 'ETH', 'SOL'];

      info(`Supported symbols: ${supported.join(', ')}`);
      const symbolsInput = await input({
        message: 'Symbols to trade (comma-separated):',
        default: supported.slice(0, 3).join(','),
      });
      const symbols = symbolsInput.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

      const spin = spinner('Creating autopilot strategy…');
      const res = await perpsApi.createStrategy(creds.accessToken, { symbols });
      spin.stop();
      assertApiOk(res, 'Failed to create autopilot strategy');
      success(`Autopilot created for ${symbols.join(', ')} and enabled!`);
      return;
    }

    if (action === 'update' && state.strategyId) {
      const symSpin = spinner('Fetching supported symbols…');
      const symRes = await perpsApi.getSupportedSymbols(creds.accessToken);
      symSpin.stop();
      const supported = symRes.success && Array.isArray(symRes.data) ? symRes.data as string[] : ['BTC', 'ETH', 'SOL'];

      info(`Supported: ${supported.join(', ')} | Current: ${state.symbols?.join(', ') ?? 'none'}`);
      const symbolsInput = await input({
        message: 'New symbols (comma-separated):',
        default: state.symbols?.join(',') ?? '',
      });
      const symbols = symbolsInput.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

      const spin = spinner('Updating strategy…');
      const res = await perpsApi.updateStrategy(creds.accessToken, { strategyId: state.strategyId, symbols });
      spin.stop();
      assertApiOk(res, 'Failed to update strategy');
      success(`Autopilot updated: ${symbols.join(', ')}`);
      return;
    }

    if (action === 'perf') {
      const spin = spinner('Fetching performance…');
      const res = await perpsApi.getPerformanceMetrics(creds.accessToken);
      spin.stop();
      if (res.success && res.data) {
        console.log('');
        console.log(chalk.bold('Autopilot Performance:'));
        printKV(res.data);
        console.log('');
      } else {
        console.log(chalk.dim('  No performance data available.'));
      }
    }
  }));

// ─── ask (long/short analysis) ──────────────────────────────────────────

const askCmd = new Command('ask')
  .description('Get AI trading analysis for an asset (long/short recommendation)')
  .action(wrapAction(async () => {
    const creds = requireAuth();

    const dataSpin = spinner('Fetching assets…');
    const assets = await perpsApi.getAssetMeta();
    dataSpin.stop();

    let symbol: string;
    if (assets.length > 0) {
      symbol = await select({
        message: 'Asset to analyze:',
        choices: assets.map((a) => {
          const pxStr = a.markPx > 0 ? `$${a.markPx.toLocaleString()}` : '';
          return { name: `${a.name.padEnd(6)} ${chalk.dim(pxStr.padStart(12))}`, value: a.name };
        }),
      });
    } else {
      symbol = await input({ message: 'Symbol (e.g. BTC):' });
    }

    const style = await select<string>({
      message: 'Analysis style:',
      choices: [
        { name: 'Scalping (minutes–hours)', value: 'scalping' },
        { name: 'Day Trading (hours–day)', value: 'day-trading' },
        { name: 'Swing Trading (days–weeks)', value: 'swing-trading' },
      ],
    });

    const styleConfig: Record<string, { interval: string; hours: number }> = {
      'scalping':      { interval: '5m',  hours: 4 },
      'day-trading':   { interval: '1h',  hours: 24 },
      'swing-trading': { interval: '4h',  hours: 24 * 7 },
    };
    const { interval, hours } = styleConfig[style] ?? styleConfig['day-trading'];
    const endTime = Date.now();
    const startTime = endTime - hours * 60 * 60 * 1000;

    const marginInput = await input({ message: 'Margin in USD:', default: '1000' });
    const leverageInput = await input({ message: 'Leverage:', default: '10' });

    const spin = spinner(`Analyzing ${symbol}…`);
    const res = await perpsApi.priceAnalysis(creds.accessToken, {
      symbol,
      startTime,
      endTime,
      interval,
      positionUSD: Number(marginInput),
      leverage: Number(leverageInput),
    });
    spin.stop();

    if (!res.success || !res.data) {
      warn(res.error?.message ?? 'Analysis failed. Try again later.');
      return;
    }

    const data = res.data as Record<string, unknown>;
    console.log('');
    console.log(chalk.bold(`AI Analysis — ${symbol} (${style}):`));
    console.log('');

    if (typeof data === 'string') {
      console.log(data);
    } else {
      printKV(data);
    }
    console.log('');

    // ── Quick Order ──────────────────────────────────────────────────
    // Extract recommendation from the AI response
    const recommendation = extractRecommendation(data, symbol, Number(marginInput), Number(leverageInput));
    if (!recommendation) return;

    const { side, entryPrice, size } = recommendation;
    const sideLabel = side === 'buy' ? chalk.green.bold('LONG') : chalk.red.bold('SHORT');
    console.log(chalk.bold('Quick Order:'));
    console.log(`  ${sideLabel} ${chalk.bold(symbol)}  |  Entry ~$${entryPrice.toLocaleString()}  |  Size ${size}  |  ${Number(leverageInput)}x`);
    console.log('');

    const doQuick = await confirm({ message: 'Place this order now?', default: false });
    if (!doQuick) return;

    // Check autopilot before placing
    const apState = await getAutopilotState(creds.accessToken);
    if (apState.active) {
      warn('Autopilot is ON — manual orders are disabled while AI is trading.');
      info('Turn off autopilot first: minara perps autopilot');
      return;
    }

    const isBuy = side === 'buy';
    const slippagePx = isBuy ? entryPrice * 1.01 : entryPrice * 0.99;
    const order: PerpsOrder = {
      a: symbol,
      b: isBuy,
      p: slippagePx.toPrecision(6),
      s: String(size),
      r: false,
      t: { trigger: { triggerPx: String(entryPrice), tpsl: 'tp', isMarket: true } },
    };

    await requireTransactionConfirmation(
      `Perps ${isBuy ? 'LONG' : 'SHORT'} ${symbol} · size ${size} @ ~$${entryPrice.toLocaleString()}`,
    );
    await requireTouchId();

    const orderSpin = spinner('Placing order…');
    const orderRes = await perpsApi.placeOrders(creds.accessToken, { orders: [order], grouping: 'na' });
    orderSpin.stop();
    assertApiOk(orderRes, 'Order placement failed');
    success('Order submitted!');
    printTxResult(orderRes.data);
  }));

/** Try to extract a tradeable recommendation from the AI analysis response. */
function extractRecommendation(
  data: Record<string, unknown> | string,
  symbol: string,
  marginUSD: number,
  leverage: number,
): { side: 'buy' | 'sell'; entryPrice: number; size: number } | null {
  if (typeof data === 'string') {
    return parseRecommendationText(data, symbol, marginUSD, leverage);
  }

  // Structured response — look for common field names
  const flat = flattenObj(data);

  const sideRaw = String(
    flat['recommendation'] ?? flat['direction'] ?? flat['side'] ?? flat['signal']
    ?? flat['action'] ?? flat['position'] ?? '',
  ).toLowerCase();

  let side: 'buy' | 'sell' | null = null;
  if (/long|buy|bullish/i.test(sideRaw)) side = 'buy';
  else if (/short|sell|bearish/i.test(sideRaw)) side = 'sell';

  if (!side) {
    // Try to infer from the full JSON text
    const jsonStr = JSON.stringify(data).toLowerCase();
    if (/\blong\b|bullish/.test(jsonStr)) side = 'buy';
    else if (/\bshort\b|bearish/.test(jsonStr)) side = 'sell';
  }

  if (!side) return null;

  const entryPrice = Number(
    flat['entryPrice'] ?? flat['entry_price'] ?? flat['entry'] ?? flat['price']
    ?? flat['currentPrice'] ?? flat['current_price'] ?? flat['markPrice'] ?? 0,
  );
  if (!entryPrice || entryPrice <= 0) return null;

  let size = Number(flat['size'] ?? flat['contracts'] ?? flat['qty'] ?? flat['quantity'] ?? 0);
  if (!size || size <= 0) {
    size = parseFloat(((marginUSD * leverage) / entryPrice).toPrecision(4));
  }
  if (!size || size <= 0) return null;

  return { side, entryPrice, size };
}

function parseRecommendationText(
  text: string,
  symbol: string,
  marginUSD: number,
  leverage: number,
): { side: 'buy' | 'sell'; entryPrice: number; size: number } | null {
  let side: 'buy' | 'sell' | null = null;
  if (/\blong\b|bullish|buy/i.test(text)) side = 'buy';
  else if (/\bshort\b|bearish|sell/i.test(text)) side = 'sell';
  if (!side) return null;

  const priceMatch = text.match(/entry[:\s]*\$?([\d,.]+)/i)
    ?? text.match(/price[:\s]*\$?([\d,.]+)/i)
    ?? text.match(/\$\s*([\d,.]+)/);
  const entryPrice = priceMatch ? Number(priceMatch[1].replace(/,/g, '')) : 0;
  if (!entryPrice || entryPrice <= 0) return null;

  const size = parseFloat(((marginUSD * leverage) / entryPrice).toPrecision(4));
  if (!size || size <= 0) return null;

  return { side, entryPrice, size };
}

/** Recursively flatten nested object keys for easier field lookup. */
function flattenObj(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(result, flattenObj(v as Record<string, unknown>, key));
    } else {
      result[k] = v;
      result[key] = v;
    }
  }
  return result;
}

// ═════════════════════════════════════════════════════════════════════════
//  Parent
// ═════════════════════════════════════════════════════════════════════════

export const perpsCommand = new Command('perps')
  .description('Hyperliquid perpetual futures — order, positions, autopilot, analysis')
  .addCommand(positionsCmd)
  .addCommand(orderCmd)
  .addCommand(cancelCmd)
  .addCommand(leverageCmd)
  .addCommand(tradesCmd)
  .addCommand(depositCmd)
  .addCommand(withdrawCmd)
  .addCommand(fundRecordsCmd)
  .addCommand(autopilotCmd)
  .addCommand(askCmd)
  .action(wrapAction(async () => {
    const creds = requireAuth();

    // Show autopilot status inline
    const apState = await getAutopilotState(creds.accessToken);
    const apLabel = apState.active ? chalk.green.bold(' [ON]') : chalk.dim(' [OFF]');

    const action = await select({
      message: 'Perps — what would you like to do?',
      choices: [
        { name: 'View positions', value: 'positions' },
        { name: 'Place order', value: 'order' },
        { name: 'Cancel order', value: 'cancel' },
        { name: 'Update leverage', value: 'leverage' },
        { name: 'View trade history', value: 'trades' },
        { name: 'Deposit USDC', value: 'deposit' },
        { name: 'Withdraw USDC', value: 'withdraw' },
        { name: 'Fund records', value: 'fund-records' },
        { name: `Autopilot${apLabel}`, value: 'autopilot' },
        { name: 'Ask AI (long/short analysis)', value: 'ask' },
      ],
    });
    const sub = perpsCommand.commands.find((c) => c.name() === action || c.aliases().includes(action));
    if (sub) await sub.parseAsync([], { from: 'user' });
  }));
