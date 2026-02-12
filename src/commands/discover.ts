import { Command } from 'commander';
import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { searchTokens, getTrendingTokens, searchStocks, getFearGreedIndex, getBitcoinMetrics } from '../api/tokens.js';
import { spinner, error } from '../utils.js';

// ─── trending ────────────────────────────────────────────────────────────

const trendingCmd = new Command('trending')
  .description('View trending tokens')
  .action(async () => {
    const spin = spinner('Fetching trending tokens…');
    const res = await getTrendingTokens();
    spin.stop();
    if (!res.success) { error(res.error?.message ?? 'Failed'); process.exit(1); }
    console.log(JSON.stringify(res.data, null, 2));
  });

// ─── search ──────────────────────────────────────────────────────────────

const searchCmd = new Command('search')
  .description('Search for tokens or stocks')
  .argument('[keyword]', 'Search keyword')
  .action(async (keywordArg?: string) => {
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

    if (!res.success) { error(res.error?.message ?? 'Failed'); process.exit(1); }
    console.log(JSON.stringify(res.data, null, 2));
  });

// ─── fear-greed ──────────────────────────────────────────────────────────

const fearGreedCmd = new Command('fear-greed')
  .description('View Fear & Greed Index')
  .action(async () => {
    const spin = spinner('Fetching…');
    const res = await getFearGreedIndex();
    spin.stop();
    if (!res.success) { error(res.error?.message ?? 'Failed'); process.exit(1); }
    console.log(JSON.stringify(res.data, null, 2));
  });

// ─── btc metrics ─────────────────────────────────────────────────────────

const btcCmd = new Command('btc-metrics')
  .description('View Bitcoin market metrics')
  .action(async () => {
    const spin = spinner('Fetching…');
    const res = await getBitcoinMetrics();
    spin.stop();
    if (!res.success) { error(res.error?.message ?? 'Failed'); process.exit(1); }
    console.log(JSON.stringify(res.data, null, 2));
  });

// ─── parent ──────────────────────────────────────────────────────────────

export const discoverCommand = new Command('discover')
  .description('Market discovery — trending, search, market indicators')
  .addCommand(trendingCmd)
  .addCommand(searchCmd)
  .addCommand(fearGreedCmd)
  .addCommand(btcCmd)
  .action(async () => {
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
  });
