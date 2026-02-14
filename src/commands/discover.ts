import { Command } from 'commander';
import { input, select } from '@inquirer/prompts';
import { searchTokens, getTrendingTokens, searchStocks, getFearGreedIndex, getBitcoinMetrics, getEthereumMetrics, getSolanaMetrics } from '../api/tokens.js';
import { spinner, assertApiOk, wrapAction } from '../utils.js';

// ─── trending ────────────────────────────────────────────────────────────

const trendingCmd = new Command('trending')
  .description('View trending tokens')
  .action(wrapAction(async () => {
    const spin = spinner('Fetching trending tokens…');
    const res = await getTrendingTokens();
    spin.stop();
    assertApiOk(res, 'Failed to fetch trending tokens');
    console.log(JSON.stringify(res.data, null, 2));
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
    console.log(JSON.stringify(res.data, null, 2));
  }));

// ─── fear-greed ──────────────────────────────────────────────────────────

const fearGreedCmd = new Command('fear-greed')
  .description('View Fear & Greed Index')
  .action(wrapAction(async () => {
    const spin = spinner('Fetching Fear & Greed Index…');
    const res = await getFearGreedIndex();
    spin.stop();
    assertApiOk(res, 'Failed to fetch Fear & Greed Index');
    console.log(JSON.stringify(res.data, null, 2));
  }));

// ─── btc metrics ─────────────────────────────────────────────────────────

const btcCmd = new Command('btc-metrics')
  .description('View Bitcoin market metrics')
  .action(wrapAction(async () => {
    const spin = spinner('Fetching Bitcoin metrics…');
    const res = await getBitcoinMetrics();
    spin.stop();
    assertApiOk(res, 'Failed to fetch Bitcoin metrics');
    console.log(JSON.stringify(res.data, null, 2));
  }));

// ─── eth metrics ─────────────────────────────────────────────────────────

const ethCmd = new Command('eth-metrics')
  .description('View Ethereum market metrics')
  .action(wrapAction(async () => {
    const spin = spinner('Fetching Ethereum metrics…');
    const res = await getEthereumMetrics();
    spin.stop();
    assertApiOk(res, 'Failed to fetch Ethereum metrics');
    console.log(JSON.stringify(res.data, null, 2));
  }));

// ─── sol metrics ─────────────────────────────────────────────────────────

const solCmd = new Command('sol-metrics')
  .description('View Solana market metrics')
  .action(wrapAction(async () => {
    const spin = spinner('Fetching Solana metrics…');
    const res = await getSolanaMetrics();
    spin.stop();
    assertApiOk(res, 'Failed to fetch Solana metrics');
    console.log(JSON.stringify(res.data, null, 2));
  }));

// ─── parent ──────────────────────────────────────────────────────────────

export const discoverCommand = new Command('discover')
  .description('Market discovery — trending, search, market indicators')
  .addCommand(trendingCmd)
  .addCommand(searchCmd)
  .addCommand(fearGreedCmd)
  .addCommand(btcCmd)
  .addCommand(ethCmd)
  .addCommand(solCmd)
  .action(wrapAction(async () => {
    const action = await select({
      message: 'Discover:',
      choices: [
        { name: 'Trending tokens', value: 'trending' },
        { name: 'Search tokens / stocks', value: 'search' },
        { name: 'Fear & Greed Index', value: 'fear-greed' },
        { name: 'Bitcoin metrics', value: 'btc-metrics' },
        { name: 'Ethereum metrics', value: 'eth-metrics' },
        { name: 'Solana metrics', value: 'sol-metrics' },
      ],
    });
    const sub = discoverCommand.commands.find((c) => c.name() === action);
    if (sub) await sub.parseAsync([], { from: 'user' });
  }));
