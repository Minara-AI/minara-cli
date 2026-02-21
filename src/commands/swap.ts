import { Command } from 'commander';
import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { swaps, swapsSimulate } from '../api/crosschain.js';
import { get } from '../api/client.js';
import { requireAuth } from '../config.js';
import { success, info, warn, spinner, formatOrderSide, assertApiOk, wrapAction, requireTransactionConfirmation, lookupToken, formatTokenLabel, normalizeChain } from '../utils.js';
import { requireTouchId } from '../touchid.js';
import { printTxResult, printKV } from '../formatters.js';
import type { SwapSide } from '../types.js';

export const swapCommand = new Command('swap')
  .description('Swap tokens (cross-chain spot trading)')
  .option('-s, --side <side>', 'buy or sell')
  .option('-t, --token <address|ticker>', 'Token contract address or ticker symbol')
  .option('-a, --amount <amount>', 'USD amount (buy) or token amount (sell)')
  .option('-y, --yes', 'Skip confirmation')
  .option('--dry-run', 'Simulate without executing')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

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

    // ── 3. Chain (derived from token) ────────────────────────────────────
    const chain = normalizeChain(tokenInfo.chain);
    if (!chain) {
      warn(`Unable to determine chain for token. Raw chain value: ${tokenInfo.chain ?? 'unknown'}`);
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

    // ── 5. Summary ───────────────────────────────────────────────────────
    console.log('');
    console.log(chalk.bold('Swap Summary:'));
    console.log(`  Chain   : ${chalk.cyan(chain)}`);
    console.log(`  Action  : ${formatOrderSide(side)}`);
    console.log(`  Token   : ${formatTokenLabel(tokenInfo)}`);
    console.log(`  Address : ${chalk.yellow(tokenInfo.address)}`);
    console.log(`  Amount  : ${chalk.bold(amount)} ${side === 'buy' ? 'USD' : '(token)'}`);
    console.log('');

    // ── 6. Dry run ───────────────────────────────────────────────────────
    if (opts.dryRun) {
      info('Simulating swap (dry-run)…');
      const spin = spinner('Simulating…');
      const simRes = await swapsSimulate(creds.accessToken, [{
        chain, side, tokenAddress: tokenInfo.address, buyUsdAmountOrSellTokenAmount: amount,
      }]);
      spin.stop();
      assertApiOk(simRes, 'Simulation failed');
      console.log('');
      console.log(chalk.bold('Simulation Result:'));
      if (Array.isArray(simRes.data)) {
        for (const item of simRes.data) {
          printKV(item as Record<string, unknown>);
          console.log('');
        }
      } else if (simRes.data) {
        printKV(simRes.data as Record<string, unknown>);
      }
      return;
    }

    // ── 7. Confirm ───────────────────────────────────────────────────────
    if (!opts.yes) {
      const confirmed = await confirm({
        message: `Confirm ${side.toUpperCase()} swap?`,
        default: false,
      });
      if (!confirmed) {
        console.log(chalk.dim('Swap cancelled.'));
        return;
      }
    }

    // ── 8. Transaction confirmation & Touch ID ────────────────────────────
    await requireTransactionConfirmation(
      `${side.toUpperCase()} swap · ${amount} ${side === 'buy' ? 'USD' : 'tokens'} · ${chain}`,
      tokenInfo,
      { chain, side, amount: `${amount} ${side === 'buy' ? 'USD' : '(token)'}` },
    );
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
