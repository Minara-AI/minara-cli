import { Command } from 'commander';
import { select, confirm, number as numberPrompt } from '@inquirer/prompts';
import chalk from 'chalk';
import { getAccount } from '../api/crosschain.js';
import { getCurrentUser } from '../api/auth.js';
import * as perpsApi from '../api/perps.js';
import { requireAuth } from '../config.js';
import { info, success, spinner, assertApiOk, wrapAction, requireTransactionConfirmation } from '../utils.js';
import { requireTouchId } from '../touchid.js';
import { printTxResult } from '../formatters.js';

const EVM_CHAINS = 'Ethereum, Base, Arbitrum, Optimism, Polygon, Avalanche, BSC, Berachain, Blast';

// ─── spot ────────────────────────────────────────────────────────────────

const spotCmd = new Command('spot')
  .description('Show spot wallet deposit addresses')
  .action(wrapAction(async () => {
    const creds = requireAuth();
    await showSpotDeposit(creds.accessToken);
  }));

async function showSpotDeposit(token: string): Promise<void> {
  const spin = spinner('Fetching deposit addresses…');
  const res = await getAccount(token);
  spin.stop();

  if (!res.success || !res.data) {
    info('Could not fetch deposit addresses. Try logging in at https://minara.ai first.');
    return;
  }

  const data = res.data as Record<string, string>;
  const evmAddr = data.evmAddress;
  const solAddr = data.solanaAddress;

  if (!evmAddr && !solAddr) {
    info('No deposit addresses found. Your account may not have been fully initialized.');
    return;
  }

  console.log('');
  console.log(chalk.bold('Spot Deposit Addresses'));
  console.log(chalk.dim('Send tokens to the addresses below. Make sure to use the correct network!'));
  console.log('');

  if (solAddr) {
    console.log(`  ${chalk.cyan.bold('Solana')}`);
    console.log(`    Address : ${chalk.yellow(solAddr)}`);
    console.log(`    Chains  : Solana`);
    console.log('');
  }

  if (evmAddr) {
    console.log(`  ${chalk.cyan.bold('EVM')}`);
    console.log(`    Address : ${chalk.yellow(evmAddr)}`);
    console.log(`    Chains  : ${EVM_CHAINS}`);
    console.log('');
  }

  console.log(chalk.red.bold('Important:'));
  console.log(chalk.red('  • Only send tokens on the supported chains listed above.'));
  console.log(chalk.red('  • Sending tokens on the wrong network may result in permanent loss.'));
  console.log('');
}

// ─── perps ───────────────────────────────────────────────────────────────

const perpsCmd = new Command('perps')
  .description('Deposit USDC to perps account')
  .option('-a, --amount <amount>', 'USDC amount (for transfer)')
  .option('-y, --yes', 'Skip confirmation')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();
    await perpsDepositFlow(creds.accessToken, opts);
  }));

async function perpsDepositFlow(token: string, opts?: { amount?: string; yes?: boolean }): Promise<void> {
  const method = await select({
    message: 'How would you like to deposit to perps?',
    choices: [
      { name: 'Show perps deposit address (for external transfers)', value: 'address' },
      { name: `${chalk.bold('Transfer from Spot wallet → Perps wallet')} (internal)`, value: 'transfer' },
    ],
  });

  if (method === 'address') {
    await showPerpsDepositAddresses(token);
  } else {
    await transferSpotToPerps(token, opts);
  }
}

async function showPerpsDepositAddresses(token: string): Promise<void> {
  const spin = spinner('Fetching perps deposit addresses…');
  const res = await getCurrentUser(token);
  spin.stop();

  if (!res.success || !res.data) {
    info('Could not fetch perps addresses. Try logging in at https://minara.ai first.');
    return;
  }

  const wallets = res.data.wallets ?? {};
  const perpsEvm = wallets['perpetual-evm'];

  if (!perpsEvm) {
    info('No perps deposit address found. Your perps account may not have been initialized yet.');
    return;
  }

  console.log('');
  console.log(chalk.bold('Perps Deposit Address'));
  console.log(chalk.dim('Send USDC to the address below to fund your perps account directly.'));
  console.log('');

  console.log(`  ${chalk.cyan.bold('EVM (Arbitrum)')}`);
  console.log(`    Address : ${chalk.yellow(perpsEvm)}`);
  console.log('');

  console.log(chalk.red.bold('Important:'));
  console.log(chalk.red('  • Only send USDC on Arbitrum to this address.'));
  console.log(chalk.red('  • Sending other tokens or using the wrong network may result in permanent loss.'));
  console.log('');
}

async function transferSpotToPerps(token: string, opts?: { amount?: string; yes?: boolean }): Promise<void> {
  console.log('');
  console.log(chalk.yellow.bold('⚠  This will transfer USDC from your Spot wallet to your Perps wallet.'));
  console.log('');

  const amount = opts?.amount
    ? parseFloat(opts.amount)
    : await numberPrompt({ message: 'USDC amount to transfer from Spot → Perps (min 5):', min: 5, required: true });

  if (!amount || amount < 5) {
    console.error(chalk.red('✖'), 'Minimum deposit is 5 USDC');
    process.exit(1);
  }

  console.log(`\n  Transfer : ${chalk.bold(amount)} USDC  ${chalk.dim('Spot wallet')} → ${chalk.cyan('Perps wallet')}\n`);
  if (!opts?.yes) {
    const ok = await confirm({ message: 'Confirm transfer from Spot to Perps?', default: true });
    if (!ok) return;
  }

  await requireTransactionConfirmation(`Transfer ${amount} USDC from Spot → Perps`, undefined, {
    amount: `${amount} USDC`,
    side: 'Spot → Perps',
  });
  await requireTouchId();

  const spin = spinner('Transferring…');
  const res = await perpsApi.deposit(token, { usdcAmount: amount });
  spin.stop();
  assertApiOk(res, 'Transfer failed');
  success(`Transferred ${amount} USDC from Spot wallet to Perps wallet`);
  printTxResult(res.data);
}

// ─── parent ──────────────────────────────────────────────────────────────

export const depositCommand = new Command('deposit')
  .description('Deposit to spot wallet or perps account')
  .addCommand(spotCmd)
  .addCommand(perpsCmd)
  .action(wrapAction(async () => {
    const action = await select({
      message: 'Deposit to:',
      choices: [
        { name: 'Spot wallet — view deposit addresses', value: 'spot' },
        { name: 'Perps wallet — view deposit address or transfer from Spot', value: 'perps' },
      ],
    });

    const creds = requireAuth();
    if (action === 'spot') {
      await showSpotDeposit(creds.accessToken);
    } else {
      await perpsDepositFlow(creds.accessToken);
    }
  }));
