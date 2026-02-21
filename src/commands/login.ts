import { Command } from 'commander';
import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import {
  sendEmailCode,
  verifyEmailCode,
  startDeviceAuth,
  getDeviceAuthStatus,
} from '../api/auth.js';
import { saveCredentials, loadCredentials, loadConfig, saveConfig } from '../config.js';
import { success, error, info, spinner, openBrowser, unwrapApi, wrapAction } from '../utils.js';
import { isTouchIdAvailable } from '../touchid.js';

// ─── Login method type ────────────────────────────────────────────────────

type LoginMethod = 'email' | 'device';

// ─── Email login flow ─────────────────────────────────────────────────────

async function loginWithEmail(emailOpt?: string): Promise<void> {
  const email = emailOpt ?? await input({
    message: 'Email:',
    validate: (v) => (v.includes('@') ? true : 'Please enter a valid email'),
  });

  const spin = spinner('Sending verification code…');
  const codeRes = await sendEmailCode({ email, platform: 'web' });
  spin.stop();

  if (!codeRes.success) {
    error(codeRes.error?.message ?? 'Failed to send verification code');
    process.exit(1);
  }
  info(`Verification code sent to ${chalk.cyan(email)}. Check your inbox.`);

  const code = await input({
    message: 'Verification code:',
    validate: (v) => (v.length > 0 ? true : 'Code is required'),
  });

  const spin2 = spinner('Verifying…');
  const verifyRes = await verifyEmailCode({ email, code, channel: 'web', deviceType: 'desktop' });
  spin2.stop();

  const user = unwrapApi(verifyRes, 'Verification failed');

  const token = user.access_token;
  if (!token) {
    error('No access token returned. Login may require additional steps.');
    process.exit(1);
  }

  saveCredentials({
    accessToken: token,
    userId: user.id,
    email: user.email ?? email,
    displayName: user.displayName,
  });

  success(`Welcome${user.displayName ? `, ${user.displayName}` : ''}! Credentials saved to ~/.minara/`);
}

// ─── Device login flow (RFC 8628) ─────────────────────────────────────────

async function loginWithDevice(): Promise<void> {
  info('Starting device login...');

  const spin = spinner('Requesting device code...');
  const startRes = await startDeviceAuth();
  spin.stop();

  if (!startRes.success || !startRes.data) {
    error(startRes.error?.message ?? 'Failed to start device login');
    process.exit(1);
  }

  const { device_code, user_code, verification_url, expires_in, interval } = startRes.data;

  console.log('');
  console.log(chalk.bold('To complete login:'));
  console.log('');
  console.log(`  1. Visit: ${chalk.cyan(verification_url)}`);
  console.log(`  2. Enter code: ${chalk.bold.yellow(user_code)}`);
  console.log('');
  info(`Waiting for authentication (expires in ${Math.floor(expires_in / 60)} minutes)...`);
  info(chalk.dim('(Press Ctrl+C to cancel)'));
  console.log('');

  // Try to open browser
  openBrowser(`${verification_url}?user_code=${user_code}`);

  // Poll for completion
  const startTime = Date.now();
  const expiresAt = startTime + expires_in * 1000;
  let pollInterval = interval * 1000;

  while (Date.now() < expiresAt) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const statusRes = await getDeviceAuthStatus(device_code);

    if (!statusRes.success || !statusRes.data) {
      // Network error, keep polling
      continue;
    }

    const data = statusRes.data;
    const { status, access_token, user } = data;

    if (status === 'expired') {
      error('Device login expired. Please try again.');
      process.exit(1);
    }

    if (status === 'completed' && access_token && user) {
      saveCredentials({
        accessToken: access_token,
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
      });

      success('Login successful! Credentials saved to ~/.minara/');
      if (user.displayName) console.log(chalk.dim(`  Welcome, ${user.displayName}`));
      if (user.email) console.log(chalk.dim(`  ${user.email}`));
      return;
    }

    // Still pending, show progress
    process.stdout.write('.');
  }

  error('Device login timed out. Please try again.');
  process.exit(1);
}

// ─── Command ──────────────────────────────────────────────────────────────

export const loginCommand = new Command('login')
  .description('Login to your Minara account')
  .option('-e, --email <email>', 'Login with email verification code')
  .option('--device', 'Login with device code (opens browser)')
  .action(
    wrapAction(async (opts: { email?: string; device?: boolean }) => {
      // Warn if already logged in
      const existing = loadCredentials();
      if (existing?.accessToken) {
        const overwrite = await confirm({
          message: 'You are already logged in. Re-login?',
          default: false,
        });
        if (!overwrite) return;
      }

      // ── Determine login method ────────────────────────────────────────
      let method: LoginMethod;
      if (opts.email) {
        method = 'email';
      } else if (opts.device) {
        method = 'device';
      } else {
        method = await select({
          message: 'How would you like to login?',
          choices: [
            { name: 'Device code (opens browser to verify)', value: 'device' as LoginMethod },
            { name: 'Email verification code', value: 'email' as LoginMethod },
          ],
        });
      }

      // ── Execute ───────────────────────────────────────────────────────
      if (method === 'email') {
        await loginWithEmail(opts.email);
      } else {
        await loginWithDevice();
      }

      // ── Offer Touch ID setup (macOS only, if not already enabled) ────
      const config = loadConfig();
      if (!config.touchId && isTouchIdAvailable()) {
        console.log('');
        const enableTouchId = await confirm({
          message: 'Enable Touch ID to protect fund operations (transfer, withdraw, swap, etc.)?',
          default: true,
        });
        if (enableTouchId) {
          saveConfig({ touchId: true });
          success('Touch ID protection enabled!');
          console.log(chalk.dim('  All fund-related operations now require fingerprint verification.'));
          console.log(chalk.dim(`  To disable, run: ${chalk.cyan('minara config')} → Touch ID`));
        }
      }
    }),
  );
