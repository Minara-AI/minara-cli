import { Command } from 'commander';
import { select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import * as paymentApi from '../api/payment.js';
import { getCurrentUser } from '../api/auth.js';
import { requireAuth } from '../config.js';
import { success, info, warn, spinner, assertApiOk, wrapAction } from '../utils.js';
import { openBrowser } from '../utils.js';
import { printKV, printTable, isRawJson } from '../formatters.js';
import type { PaymentPlan, CreditPackage } from '../types.js';

// ─── helpers ────────────────────────────────────────────────────────────

function formatPrice(plan: PaymentPlan): string {
  if (plan.price === 0) return chalk.green('Free');
  const price = `$${plan.price}`;
  const period = plan.interval === 'month' ? '/mo' : '/yr';
  return chalk.bold(price) + chalk.dim(period);
}

function formatCredits(rules: PaymentPlan['rules']): string {
  const credits = rules.limitCredit ? Number(rules.limitCredit).toLocaleString() : '—';
  return credits;
}

/** Group plans by tier name and display monthly + yearly side-by-side */
function groupPlansByTier(plans: PaymentPlan[]): Map<string, { monthly?: PaymentPlan; yearly?: PaymentPlan }> {
  const tiers = new Map<string, { monthly?: PaymentPlan; yearly?: PaymentPlan }>();
  for (const p of plans) {
    if (p.status !== 'active') continue;
    const existing = tiers.get(p.name) ?? {};
    if (p.interval === 'month') existing.monthly = p;
    else existing.yearly = p;
    tiers.set(p.name, existing);
  }
  return tiers;
}

// ─── plans ──────────────────────────────────────────────────────────────

const plansCmd = new Command('plans')
  .description('View all available subscription plans')
  .action(wrapAction(async () => {
    const spin = spinner('Fetching plans…');
    const res = await paymentApi.getPlans();
    spin.stop();
    assertApiOk(res, 'Failed to fetch plans');

    const { plans, packages } = res.data!;

    if (isRawJson()) {
      console.log(JSON.stringify(res.data, null, 2));
      return;
    }

    // ── Subscription Plans ──────────────────────────────────────────
    console.log('');
    console.log(chalk.bold('Subscription Plans:'));
    console.log('');

    const tiers = groupPlansByTier(plans);

    // Table header
    const header = [
      chalk.white.bold('Plan'),
      chalk.white.bold('Monthly'),
      chalk.white.bold('Yearly'),
      chalk.white.bold('Credits'),
      chalk.white.bold('Workflows'),
      chalk.white.bold('Invites'),
    ];

    const rows: string[][] = [];
    for (const [tierName, tier] of tiers) {
      const ref = tier.monthly ?? tier.yearly!;
      const monthly = tier.monthly ? formatPrice(tier.monthly) : chalk.dim('—');
      const yearly = tier.yearly ? formatPrice(tier.yearly) : chalk.dim('—');
      const savings = tier.monthly && tier.yearly
        ? chalk.green(` (save ${Math.round((1 - tier.yearly.price / (tier.monthly.price * 12)) * 100)}%)`)
        : '';
      rows.push([
        chalk.bold(tierName),
        monthly,
        yearly + savings,
        formatCredits(ref.rules),
        String(ref.rules.limitWorkflows ?? 0),
        String(ref.inviteCount ?? 0),
      ]);
    }

    // Print using cli-table3 directly for custom layout
    const Table = (await import('cli-table3')).default;
    const table = new Table({
      head: header,
      style: { head: [], border: ['dim'] },
    });
    for (const row of rows) table.push(row);
    console.log(table.toString());

    // ── Credit Packages ─────────────────────────────────────────────
    if (packages.length > 0) {
      console.log('');
      console.log(chalk.bold('Credit Packages (one-time):'));
      console.log('');
      const pkgTable = new Table({
        head: [
          chalk.white.bold('Price'),
          chalk.white.bold('Credits'),
        ],
        style: { head: [], border: ['dim'] },
      });
      for (const pkg of packages) {
        pkgTable.push([
          chalk.bold(`$${pkg.amount}`),
          Number(pkg.credit).toLocaleString(),
        ]);
      }
      console.log(pkgTable.toString());
    }

    console.log('');
    console.log(chalk.dim('  Subscribe: ') + chalk.cyan('minara premium subscribe'));
    console.log('');
  }));

// ─── status ─────────────────────────────────────────────────────────────

const statusCmd = new Command('status')
  .description('View your current subscription status')
  .action(wrapAction(async () => {
    const creds = requireAuth();

    const spin = spinner('Fetching subscription status…');
    const [userRes, plansRes] = await Promise.all([
      getCurrentUser(creds.accessToken),
      paymentApi.getPlans(),
    ]);
    spin.stop();
    assertApiOk(userRes, 'Failed to fetch account info');

    const user = userRes.data!;

    if (isRawJson()) {
      console.log(JSON.stringify({
        subscription: user.subscription ?? null,
        plan: user.plan ?? null,
      }, null, 2));
      return;
    }

    console.log('');
    console.log(chalk.bold('Subscription Status:'));
    console.log('');

    // Try to extract subscription info from various possible response shapes
    const sub = user.subscription as Record<string, unknown> | undefined;
    const userPlan = user.plan as Record<string, unknown> | undefined;

    if (sub && Object.keys(sub).length > 0) {
      const planName = sub.planName ?? sub.plan ?? sub.name ?? '—';
      const status = sub.status as string ?? '—';
      const interval = sub.interval ?? '—';
      const cancelAt = sub.cancelAtPeriodEnd;
      const periodEnd = sub.currentPeriodEnd as string | undefined;

      console.log(`  ${chalk.dim('Plan'.padEnd(16))} : ${chalk.bold(String(planName))}`);
      console.log(`  ${chalk.dim('Status'.padEnd(16))} : ${status === 'active' ? chalk.green('Active') : chalk.yellow(String(status))}`);
      console.log(`  ${chalk.dim('Billing'.padEnd(16))} : ${String(interval)}`);
      if (periodEnd) {
        console.log(`  ${chalk.dim('Renews On'.padEnd(16))} : ${new Date(periodEnd).toLocaleDateString()}`);
      }
      if (cancelAt) {
        console.log(`  ${chalk.dim(''.padEnd(16))}   ${chalk.yellow('⚠ Will cancel at end of billing period')}`);
      }
    } else if (userPlan && Object.keys(userPlan).length > 0) {
      printKV(userPlan);
    } else {
      // No subscription info found — assume free plan
      console.log(`  ${chalk.dim('Plan'.padEnd(16))} : ${chalk.bold('Free')}`);
      console.log(`  ${chalk.dim('Status'.padEnd(16))} : ${chalk.green('Active')}`);
      console.log('');
      console.log(chalk.dim('  Upgrade with: ') + chalk.cyan('minara premium subscribe'));
    }

    console.log('');
  }));

// ─── subscribe ──────────────────────────────────────────────────────────

const subscribeCmd = new Command('subscribe')
  .description('Subscribe to a plan or change your plan (upgrade / downgrade)')
  .action(wrapAction(async () => {
    const creds = requireAuth();

    // 1. Fetch plans
    const spin = spinner('Fetching plans…');
    const plansRes = await paymentApi.getPlans();
    spin.stop();
    assertApiOk(plansRes, 'Failed to fetch plans');

    const { plans } = plansRes.data!;
    const activePlans = plans.filter((p) => p.status === 'active' && p.price > 0);

    if (activePlans.length === 0) {
      info('No paid plans available.');
      return;
    }

    // 2. Select plan
    const selectedPlanId = await select({
      message: 'Select a plan:',
      choices: activePlans.map((p) => ({
        name: `${p.name} (${p.interval === 'month' ? 'Monthly' : 'Yearly'}) — ${formatPrice(p)}  [${formatCredits(p.rules)} credits, ${p.rules.limitWorkflows ?? 0} workflows]`,
        value: p._id,
      })),
    });

    const selectedPlan = activePlans.find((p) => p._id === selectedPlanId)!;

    // 3. Select payment method
    const payMethod = await select({
      message: 'Payment method:',
      choices: [
        { name: 'Credit Card (Stripe)', value: 'stripe' as const },
        { name: 'Crypto (USDC on-chain)', value: 'crypto' as const },
      ],
    });

    // 4. Confirm
    const priceStr = `$${selectedPlan.price}/${selectedPlan.interval === 'month' ? 'mo' : 'yr'}`;
    console.log('');
    console.log(chalk.bold('Order Summary:'));
    console.log(`  Plan    : ${chalk.bold(selectedPlan.name)} (${selectedPlan.interval === 'month' ? 'Monthly' : 'Yearly'})`);
    console.log(`  Price   : ${chalk.bold(priceStr)}`);
    console.log(`  Payment : ${payMethod === 'stripe' ? 'Credit Card (Stripe)' : 'Crypto (USDC)'}`);
    console.log('');

    const ok = await confirm({ message: 'Proceed to checkout?', default: true });
    if (!ok) {
      console.log(chalk.dim('Cancelled.'));
      return;
    }

    // 5. Create checkout
    if (payMethod === 'stripe') {
      await handleStripeCheckout(creds.accessToken, selectedPlanId);
    } else {
      await handleCryptoCheckout(creds.accessToken, selectedPlanId);
    }
  }));

async function handleStripeCheckout(token: string, planId: string): Promise<void> {
  const spin = spinner('Creating checkout session…');
  const res = await paymentApi.checkoutPlan(
    token,
    planId,
    'https://minara.ai/payment/success',
    'https://minara.ai/payment/cancel',
  );
  spin.stop();
  assertApiOk(res, 'Failed to create checkout session');

  const data = res.data!;
  const url = data.url ?? (data as Record<string, unknown>).checkoutUrl as string | undefined;

  if (url) {
    success('Checkout session created!');
    console.log('');
    console.log(chalk.dim('  Opening browser for payment…'));
    console.log(chalk.cyan(`  ${url}`));
    console.log('');
    openBrowser(url);
    info('Complete the payment in your browser. Your subscription will activate automatically.');
  } else {
    // Fallback: show all returned data
    success('Checkout session created:');
    printKV(data as Record<string, unknown>);
  }
}

async function handleCryptoCheckout(token: string, planId: string): Promise<void> {
  const spin = spinner('Creating crypto checkout…');
  const res = await paymentApi.cryptoCheckoutPlan(token, planId);
  spin.stop();
  assertApiOk(res, 'Failed to create crypto checkout');

  const data = res.data!;
  const url = data.url ?? (data as Record<string, unknown>).checkoutUrl as string | undefined;

  if (url) {
    success('Crypto checkout created!');
    console.log('');
    console.log(chalk.dim('  Opening browser for crypto payment…'));
    console.log(chalk.cyan(`  ${url}`));
    console.log('');
    openBrowser(url);
    info('Complete the crypto payment in your browser. Your subscription will activate after confirmation.');
  } else if (data.address) {
    success('Crypto payment details:');
    console.log('');
    printKV(data as Record<string, unknown>);
    console.log('');
    info('Send the exact amount to the address above. Your subscription will activate after on-chain confirmation.');
  } else {
    success('Crypto checkout created:');
    printKV(data as Record<string, unknown>);
  }
}

// ─── buy-credits ────────────────────────────────────────────────────────

const buyCreditsCmd = new Command('buy-credits')
  .description('Buy a one-time credit package')
  .action(wrapAction(async () => {
    const creds = requireAuth();

    const spin = spinner('Fetching packages…');
    const plansRes = await paymentApi.getPlans();
    spin.stop();
    assertApiOk(plansRes, 'Failed to fetch packages');

    const { packages } = plansRes.data!;
    if (packages.length === 0) {
      info('No credit packages available.');
      return;
    }

    // Select package
    const selectedPkgId = await select({
      message: 'Select a credit package:',
      choices: packages.map((pkg) => ({
        name: `$${pkg.amount} — ${Number(pkg.credit).toLocaleString()} credits`,
        value: pkg._id,
      })),
    });

    const selectedPkg = packages.find((p) => p._id === selectedPkgId)!;

    // Select payment method
    const payMethod = await select({
      message: 'Payment method:',
      choices: [
        { name: 'Credit Card (Stripe)', value: 'stripe' as const },
        { name: 'Crypto (USDC on-chain)', value: 'crypto' as const },
      ],
    });

    console.log('');
    console.log(chalk.bold('Package Summary:'));
    console.log(`  Price      : ${chalk.bold('$' + selectedPkg.amount)}`);
    console.log(`  Credits    : ${Number(selectedPkg.credit).toLocaleString()}`);
    console.log(`  Payment    : ${payMethod === 'stripe' ? 'Credit Card (Stripe)' : 'Crypto (USDC)'}`);
    console.log('');

    const ok = await confirm({ message: 'Proceed to checkout?', default: true });
    if (!ok) { console.log(chalk.dim('Cancelled.')); return; }

    if (payMethod === 'stripe') {
      const spin2 = spinner('Creating checkout session…');
      const res = await paymentApi.checkoutPackage(
        creds.accessToken, selectedPkgId,
        'https://minara.ai/payment/success',
        'https://minara.ai/payment/cancel',
      );
      spin2.stop();
      assertApiOk(res, 'Failed to create checkout');
      const url = res.data?.url ?? (res.data as Record<string, unknown>)?.checkoutUrl as string | undefined;
      if (url) {
        success('Opening browser for payment…');
        console.log(chalk.cyan(`  ${url}`));
        openBrowser(url);
      } else {
        success('Checkout created:');
        printKV(res.data as Record<string, unknown>);
      }
    } else {
      const spin2 = spinner('Creating crypto checkout…');
      const res = await paymentApi.cryptoCheckoutPackage(creds.accessToken, selectedPkgId);
      spin2.stop();
      assertApiOk(res, 'Failed to create crypto checkout');
      const url = res.data?.url ?? (res.data as Record<string, unknown>)?.checkoutUrl as string | undefined;
      if (url) {
        success('Opening browser for crypto payment…');
        console.log(chalk.cyan(`  ${url}`));
        openBrowser(url);
      } else {
        success('Crypto checkout:');
        printKV(res.data as Record<string, unknown>);
      }
    }
  }));

// ─── cancel ─────────────────────────────────────────────────────────────

const cancelCmd = new Command('cancel')
  .description('Cancel your current subscription')
  .option('-y, --yes', 'Skip confirmation')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();

    if (!opts.yes) {
      warn('Cancelling your subscription will downgrade you to the Free plan at the end of your billing period.');
      console.log('');
      const ok = await confirm({
        message: 'Are you sure you want to cancel your subscription?',
        default: false,
      });
      if (!ok) {
        console.log(chalk.dim('Kept your subscription.'));
        return;
      }
    }

    const spin = spinner('Cancelling subscription…');
    const res = await paymentApi.cancelSubscription(creds.accessToken);
    spin.stop();
    assertApiOk(res, 'Failed to cancel subscription');

    success('Subscription cancelled.');
    info('You will continue to have access until the end of your current billing period.');
    if (res.data && typeof res.data === 'object' && Object.keys(res.data).length > 0) {
      console.log('');
      printKV(res.data);
    }
  }));

// ─── parent ─────────────────────────────────────────────────────────────

export const premiumCommand = new Command('premium')
  .description('Manage your Minara subscription — plans, subscribe, cancel')
  .addCommand(plansCmd)
  .addCommand(statusCmd)
  .addCommand(subscribeCmd)
  .addCommand(buyCreditsCmd)
  .addCommand(cancelCmd)
  .action(wrapAction(async () => {
    const action = await select({
      message: 'Premium:',
      choices: [
        { name: 'View available plans', value: 'plans' },
        { name: 'View my subscription', value: 'status' },
        { name: 'Subscribe / Change plan', value: 'subscribe' },
        { name: 'Buy credit package', value: 'buy-credits' },
        { name: 'Cancel subscription', value: 'cancel' },
      ],
    });
    const sub = premiumCommand.commands.find((c) => c.name() === action);
    if (sub) await sub.parseAsync([], { from: 'user' });
  }));
