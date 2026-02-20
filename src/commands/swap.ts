import { Command } from 'commander';
import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { swap, swapsSimulate } from '../api/crosschain.js';
import { requireAuth } from '../config.js';
import { success, info, spinner, formatOrderSide, assertApiOk, selectChain, wrapAction, requireTransactionConfirmation, lookupToken, formatTokenLabel } from '../utils.js';
import { requireTouchId } from '../touchid.js';
import { printTxResult, printKV } from '../formatters.js';
import type { SwapSide } from '../types.js';

export const swapCommand = new Command('swap')
  .description('Swap tokens (cross-chain spot trading)')
  .option('-c, --chain <chain>', 'Blockchain (e.g. solana, base, ethereum)')
  .option('-s, --side <side>', 'buy or sell')
  .option('-t, --token <address|ticker>', 'Token contract address or ticker symbol')
  .option('-a, --amount <amount>', 'USD amount (buy) or token amount (sell)')
  .option('-y, --yes', 'Skip confirmation')
  .option('--dry-run', 'Simulate without executing')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    // ── 1. Chain ─────────────────────────────────────────────────────────
    const chain = opts.chain ?? await selectChain();

    // ── 2. Side ──────────────────────────────────────────────────────────
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

    // ── 3. Token ───────────────────────────────────────────────────────────
    const tokenInput: string = opts.token ?? await input({
      message: 'Token (contract address or ticker):',
      validate: (v) => (v.length > 0 ? true : 'Please enter a token address or ticker'),
    });
    const tokenInfo = await lookupToken(tokenInput);

    // ── 4. Amount ────────────────────────────────────────────────────────
    const amountLabel = side === 'buy' ? 'USD amount to spend' : 'Token amount to sell';
    const amount: string = opts.amount ?? await input({
      message: `${amountLabel}:`,
      validate: (v) => {
        const n = parseFloat(v);
        return (isNaN(n) || n <= 0) ? 'Enter a valid positive number' : true;
      },
    });

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
    await requireTransactionConfirmation(`${side.toUpperCase()} swap · ${amount} ${side === 'buy' ? 'USD' : 'tokens'} · ${chain}`, tokenInfo);
    await requireTouchId();

    // ── 9. Execute ───────────────────────────────────────────────────────
    const spin = spinner('Executing swap…');
    const res = await swap(creds.accessToken, {
      chain, side, tokenAddress: tokenInfo.address, buyUsdAmountOrSellTokenAmount: amount,
    });
    spin.stop();

    assertApiOk(res, 'Swap failed');
    success('Swap submitted!');
    printTxResult(res.data);
  }));
