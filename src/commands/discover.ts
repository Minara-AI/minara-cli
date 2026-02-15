import { Command } from 'commander';
import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { searchTokens, getTrendingTokens, searchStocks, getFearGreedIndex, getBitcoinMetrics } from '../api/tokens.js';
import { spinner, assertApiOk, wrapAction } from '../utils.js';
import { printKV, printTable, printFearGreed, printCryptoMetrics, TOKEN_COLUMNS } from '../formatters.js';

// ─── trending ────────────────────────────────────────────────────────────

const trendingCmd = new Command('trending')
  .description('View trending tokens')
  .action(wrapAction(async () => {
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
        { name: 'Trending tokens', value: 'trending' },
        { name: 'Search tokens / stocks', value: 'search' },
        { name: 'Fear & Greed Index', value: 'fear-greed' },
        { name: 'Bitcoin metrics', value: 'btc-metrics' },
      ],
    });
    const sub = discoverCommand.commands.find((c) => c.name() === action);
    if (sub) await sub.parseAsync([], { from: 'user' });
  }));
