import { Command } from 'commander';
import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { searchTokens, getTrendingTokens, getTrendingStocks, searchStocks, getFearGreedIndex, getBitcoinMetrics } from '../api/tokens.js';
import { spinner, assertApiOk, wrapAction } from '../utils.js';
import { printKV, printTable, printFearGreed, printCryptoMetrics, TOKEN_COLUMNS, STOCK_COLUMNS } from '../formatters.js';

function flattenStock(item: Record<string, unknown>): Record<string, unknown> {
  const td = (item.tradeData ?? {}) as Record<string, unknown>;
  return {
    symbol: item.symbol ?? td.symbol,
    name: item.name ?? td.name,
    price: td.price,
    priceChange24H: td.price_change_24h_percent != null
      ? Number(td.price_change_24h_percent) * 100
      : undefined,
    volume24H: td.volume_24h_usd,
    marketCap: td.market,
  };
}

// ─── trending ────────────────────────────────────────────────────────────

const trendingCmd = new Command('trending')
  .description('View trending tokens or stocks')
  .argument('[category]', 'tokens or stocks (default: interactive)')
  .action(wrapAction(async (categoryArg?: string) => {
    let category = categoryArg?.toLowerCase();
    if (!category || (category !== 'tokens' && category !== 'stocks')) {
      category = await select({
        message: 'Trending:',
        choices: [
          { name: 'Tokens (crypto)', value: 'tokens' },
          { name: 'Stocks (tokenized)', value: 'stocks' },
        ],
      });
    }

    if (category === 'stocks') {
      const spin = spinner('Fetching trending stocks…');
      const res = await getTrendingStocks();
      spin.stop();
      assertApiOk(res, 'Failed to fetch trending stocks');

      console.log('');
      console.log(chalk.bold('Trending Stocks:'));
      if (Array.isArray(res.data) && res.data.length > 0) {
        const rows = res.data.map((s) => flattenStock(s as Record<string, unknown>));
        printTable(rows, STOCK_COLUMNS);
      } else {
        console.log(chalk.dim('  No trending stocks found.'));
      }
      console.log('');
    } else {
      const spin = spinner('Fetching trending tokens…');
      const res = await getTrendingTokens();
      spin.stop();
      assertApiOk(res, 'Failed to fetch trending tokens');

      console.log('');
      console.log(chalk.bold('Trending Tokens:'));
      if (Array.isArray(res.data) && res.data.length > 0) {
        printTable(res.data, TOKEN_COLUMNS);
      } else if (res.data && typeof res.data === 'object') {
        printKV(res.data as object);
      }
      console.log('');
    }
  }));

// ─── search ──────────────────────────────────────────────────────────────

const searchCmd = new Command('search')
  .description('Search for tokens or stocks')
  .argument('[keyword]', 'Search keyword')
  .action(wrapAction(async (keywordArg?: string) => {
    const keyword = keywordArg ?? await input({ message: 'Search keyword:' });

    const category = await select({
      message: 'Search in:',
      choices: [
        { name: 'Tokens (crypto)', value: 'tokens' },
        { name: 'Stocks', value: 'stocks' },
      ],
    });

    const spin = spinner(`Searching ${category}…`);
    const res = category === 'tokens'
      ? await searchTokens(keyword)
      : await searchStocks(keyword);
    spin.stop();

    assertApiOk(res, `Search for "${keyword}" failed`);

    console.log('');
    console.log(chalk.bold(`Search Results for "${keyword}":`));
    if (Array.isArray(res.data) && res.data.length > 0) {
      printTable(res.data, category === 'tokens' ? TOKEN_COLUMNS : undefined);
    } else if (Array.isArray(res.data)) {
      console.log(chalk.dim('  No results found.'));
    } else if (res.data && typeof res.data === 'object') {
      printKV(res.data as object);
    }
    console.log('');
  }));

// ─── fear-greed ──────────────────────────────────────────────────────────

const fearGreedCmd = new Command('fear-greed')
  .description('View Fear & Greed Index')
  .action(wrapAction(async () => {
    const spin = spinner('Fetching Fear & Greed Index…');
    const res = await getFearGreedIndex();
    spin.stop();
    assertApiOk(res, 'Failed to fetch Fear & Greed Index');

    console.log('');
    console.log(chalk.bold('Fear & Greed Index:'));
    printFearGreed(res.data as Record<string, unknown>);
    console.log('');
  }));

// ─── btc metrics ─────────────────────────────────────────────────────────

const btcCmd = new Command('btc-metrics')
  .description('View Bitcoin market metrics')
  .action(wrapAction(async () => {
    const spin = spinner('Fetching Bitcoin metrics…');
    const res = await getBitcoinMetrics();
    spin.stop();
    assertApiOk(res, 'Failed to fetch Bitcoin metrics');

    console.log('');
    console.log(chalk.bold('Bitcoin Metrics:'));
    printCryptoMetrics(res.data as Record<string, unknown>);
    console.log('');
  }));

// ─── parent ──────────────────────────────────────────────────────────────

export const discoverCommand = new Command('discover')
  .description('Market discovery — trending, search, market indicators')
  .addCommand(trendingCmd)
  .addCommand(searchCmd)
  .addCommand(fearGreedCmd)
  .addCommand(btcCmd)
  .action(wrapAction(async () => {
    const action = await select({
      message: 'Discover:',
      choices: [
        { name: 'Trending tokens / stocks', value: 'trending' },
        { name: 'Search tokens / stocks', value: 'search' },
        { name: 'Fear & Greed Index', value: 'fear-greed' },
        { name: 'Bitcoin metrics', value: 'btc-metrics' },
      ],
    });
    const sub = discoverCommand.commands.find((c) => c.name() === action);
    if (sub) await sub.parseAsync([], { from: 'user' });
  }));
