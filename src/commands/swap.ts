import { Command } from 'commander';
import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { swaps, swapsSimulate } from '../api/crosschain.js';
import { get } from '../api/client.js';
import { requireAuth } from '../config.js';
import { success, info, warn, spinner, assertApiOk, wrapAction, requireTransactionConfirmation, lookupToken, normalizeChain } from '../utils.js';
import { requireTouchId } from '../touchid.js';
import { printTxResult, printSwapSimulation } from '../formatters.js';
import type { SwapSide, Chain, CrossChainSwapsSimulateItem } from '../types.js';

export const swapCommand = new Command('swap')
  .description('Swap tokens (cross-chain spot trading)')
  .option('-s, --side <side>', 'buy or sell')
  .option('-t, --token <address|ticker>', 'Token contract address or ticker symbol')
  .option('-a, --amount <amount>', 'USD amount (buy) or token amount (sell)')
  .option('-c, --chain <chain>', 'Blockchain (ethereum, base, solana, etc.)')
  .option('-y, --yes', 'Skip confirmation')
  .option('--dry-run', 'Simulate without executing')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    // ── 0. Validate CLI options early ────────────────────────────────────
    if (opts.amount) {
      const amountNum = parseFloat(opts.amount);
      if (opts.amount.toLowerCase() !== 'all' && (isNaN(amountNum) || amountNum <= 0)) {
        throw new Error('Amount must be a positive number');
      }
    }

    // ── 1. Side ──────────────────────────────────────────────────────────
    let side: SwapSide = opts.side;
    if (!side) {
      side = await select({
        message: 'Action:',
        choices: [
          { name: 'Buy  — spend USDC to buy token', value: 'buy' as SwapSide },
          { name: 'Sell — sell token for USDC', value: 'sell' as SwapSide },
        ],
      });
    }

    // ── 2. Token ───────────────────────────────────────────────────────────
    const tokenInput: string = opts.token ?? await input({
      message: 'Token (contract address or ticker):',
      validate: (v) => (v.length > 0 ? true : 'Please enter a token address or ticker'),
    });
    const tokenInfo = await lookupToken(tokenInput);

    // ── 3. Chain (use explicit flag or derive from token) ────────────────
    let chain: Chain | undefined = opts.chain ? normalizeChain(opts.chain) : undefined;
    if (opts.chain && !chain) {
      warn(`Unsupported chain: ${opts.chain}`);
      return;
    }
    if (!chain) {
      chain = normalizeChain(tokenInfo.chain);
    }
    if (!chain) {
      warn('Unable to determine chain. Use --chain to specify.');
      return;
    }

    // ── 4. Amount ────────────────────────────────────────────────────────
    let maxBalance: number | undefined;
    if (side === 'sell') {
      const pnlRes = await get<Record<string, unknown>[]>('/users/pnls/all', { token: creds.accessToken });
      if (pnlRes.success && Array.isArray(pnlRes.data)) {
        const match = pnlRes.data.find((t) => {
          const addr = String(t.tokenAddress ?? '').toLowerCase();
          const cid = String(t.chainId ?? '').toLowerCase();
          const targetChain = chain.toLowerCase();
          return addr === tokenInfo.address.toLowerCase() && cid === targetChain;
        });
        if (match) {
          maxBalance = Number(match.balance ?? 0);
          info(`Available balance: ${chalk.bold(String(maxBalance))} ${tokenInfo.symbol ?? ''}`);
        }
      }
    }

    const amountLabel = side === 'buy' ? 'USD amount to spend' : `Token amount to sell${maxBalance ? ' ("all" for max)' : ''}`;
    let amount: string = opts.amount ?? await input({
      message: `${amountLabel}:`,
      validate: (v) => {
        if (side === 'sell' && v.toLowerCase() === 'all') return true;
        const n = parseFloat(v);
        return (isNaN(n) || n <= 0) ? 'Enter a valid positive number' : true;
      },
    });

    if (side === 'sell') {
      if (amount.toLowerCase() === 'all') {
        if (!maxBalance || maxBalance <= 0) {
          warn('Could not determine balance. Please enter an amount manually.');
          return;
        }
        amount = String(maxBalance);
        info(`Selling all: ${chalk.bold(amount)} ${tokenInfo.symbol ?? ''}`);
      } else if (maxBalance && parseFloat(amount) > maxBalance) {
        info(`Amount exceeds balance (${maxBalance}), using max balance`);
        amount = String(maxBalance);
      }
    }

    // ── 5. Dry run ───────────────────────────────────────────────────────
    if (opts.dryRun) {
      info('Simulating swap (dry-run)…');
      const spin = spinner('Simulating…');
      const simRes = await swapsSimulate(creds.accessToken, [{
        chain, side, tokenAddress: tokenInfo.address, buyUsdAmountOrSellTokenAmount: amount,
      }]);
      spin.stop();
      assertApiOk(simRes, 'Simulation failed');
      if (simRes.data && Array.isArray(simRes.data)) {
        for (const item of simRes.data) {
          printSwapSimulation(item);
        }
      }
      return;
    }

    // ── 7. Confirm & Touch ID ──────────────────────────────────────────
    if (!opts.yes) {
      await requireTransactionConfirmation(
        `${side.toUpperCase()} swap · ${amount} ${side === 'buy' ? 'USD' : 'tokens'} · ${chain}`,
        tokenInfo,
        { chain, side, amount: `${amount} ${side === 'buy' ? 'USD' : '(token)'}` },
      );
    }
    await requireTouchId();

    // ── 9. Execute ───────────────────────────────────────────────────────
    const spin = spinner('Executing swap…');
    const res = await swaps(creds.accessToken, [{
      chain, side, tokenAddress: tokenInfo.address, buyUsdAmountOrSellTokenAmount: amount,
    }]);
    spin.stop();

    assertApiOk(res, 'Swap failed');
    success('Swap submitted!');
    if (Array.isArray(res.data)) {
      for (const tx of res.data) printTxResult(tx);
    } else {
      printTxResult(res.data);
    }
  }));
