import { Command } from 'commander';
import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { sendEmailCode, verifyEmailCode, getOAuthUrl, getCurrentUser } from '../api/auth.js';
import { saveCredentials, loadCredentials } from '../config.js';
import { success, error, info, warn, spinner, openBrowser } from '../utils.js';
import { startOAuthServer } from '../oauth-server.js';
import { OAUTH_PROVIDERS, type OAuthProvider } from '../types.js';

// ─── Login method type ────────────────────────────────────────────────────

type LoginMethod = 'email' | OAuthProvider;

// ─── Email login flow ─────────────────────────────────────────────────────

async function loginWithEmail(emailOpt?: string): Promise<void> {
  // 1. Email
  const email = emailOpt ?? await input({
    message: 'Email:',
    validate: (v) => (v.includes('@') ? true : 'Please enter a valid email'),
  });

  // 2. Send code
  const spin = spinner('Sending verification code…');
  const codeRes = await sendEmailCode({ email, platform: 'cli' });
  spin.stop();

  if (!codeRes.success) {
    error(codeRes.error?.message ?? 'Failed to send verification code');
    process.exit(1);
  }
  info(`Verification code sent to ${chalk.cyan(email)}. Check your inbox.`);

  // 3. Input code
  const code = await input({
    message: 'Verification code:',
    validate: (v) => (v.length > 0 ? true : 'Code is required'),
  });

  // 4. Verify
  const spin2 = spinner('Verifying…');
  const verifyRes = await verifyEmailCode({
    email,
    code,
    channel: 'cli',
    deviceType: 'cli',
  });
  spin2.stop();

  if (!verifyRes.success || !verifyRes.data) {
    error(verifyRes.error?.message ?? 'Verification failed');
    process.exit(1);
  }

  const user = verifyRes.data;
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

// ─── OAuth login flow (Google / Apple / Twitter / Discord) ────────────────

async function loginWithOAuth(provider: OAuthProvider): Promise<void> {
  const providerName = OAUTH_PROVIDERS.find((p) => p.value === provider)?.name ?? provider;

  info(`Starting ${providerName} login…`);

  // 1. Start local callback server
  let server;
  try {
    server = await startOAuthServer(/* timeout: 5 min */);
  } catch (err) {
    error(`Could not start local server: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // 2. Get the OAuth authorization URL from the API
  const spin = spinner(`Requesting ${providerName} authorization URL…`);
  const urlRes = await getOAuthUrl(provider, server.callbackUrl);
  spin.stop();

  if (!urlRes.success || !urlRes.data?.url) {
    server.close();
    if (urlRes.error?.message) {
      error(`${providerName} login is not available: ${urlRes.error.message}`);
    } else {
      error(`Failed to get ${providerName} authorization URL`);
    }
    process.exit(1);
  }

  const authUrl = urlRes.data.url;

  // 3. Open the browser
  console.log('');
  console.log(chalk.bold(`Opening ${providerName} login in your browser…`));
  console.log(chalk.dim(`If the browser doesn't open automatically, visit:`));
  console.log(chalk.cyan(authUrl));
  console.log('');
  info('Waiting for you to complete authentication in the browser…');
  info(chalk.dim('(Press Ctrl+C to cancel)'));
  console.log('');

  openBrowser(authUrl);

  // 4. Wait for callback
  const result = await server.waitForCallback();

  if (result.error) {
    error(`Login failed: ${result.error}`);
    process.exit(1);
  }

  if (result.accessToken) {
    // Token received directly from callback
    saveCredentials({
      accessToken: result.accessToken,
      userId: result.userId,
      email: result.email,
      displayName: result.displayName,
    });

    // Fetch full user info if we only got the token
    if (!result.email && !result.displayName) {
      const spin2 = spinner('Fetching account info…');
      const meRes = await getCurrentUser(result.accessToken);
      spin2.stop();

      if (meRes.success && meRes.data) {
        saveCredentials({
          accessToken: result.accessToken,
          userId: meRes.data.id,
          email: meRes.data.email,
          displayName: meRes.data.displayName,
        });
      }
    }

    success(`${providerName} login successful! Credentials saved to ~/.minara/`);
    if (result.displayName) {
      console.log(chalk.dim(`  Welcome, ${result.displayName}`));
    }
    if (result.email) {
      console.log(chalk.dim(`  ${result.email}`));
    }
  } else {
    // No token in callback — the response may use a different field
    warn('No access token found in the callback response.');
    console.log(chalk.dim('Raw callback parameters:'));
    for (const [k, v] of Object.entries(result.rawParams)) {
      console.log(chalk.dim(`  ${k}: ${v}`));
    }
    error('Please check if the API returned the token in a different format.');
    info('You can try logging in with email instead: minara login --email');
    process.exit(1);
  }
}

// ─── Command ──────────────────────────────────────────────────────────────

export const loginCommand = new Command('login')
  .description('Login to your Minara account')
  .option('-e, --email <email>', 'Login with email verification code')
  .option('--google', 'Login with Google')
  .option('--apple', 'Login with Apple ID')
  .action(async (opts: {
    email?: string;
    google?: boolean;
    apple?: boolean;
  }) => {
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
    } else if (opts.google) {
      method = 'google';
    } else if (opts.apple) {
      method = 'apple';
    } else {
      // Interactive: ask user to choose
      method = await select({
        message: 'How would you like to login?',
        choices: [
          { name: '📧 Email verification code', value: 'email' as LoginMethod },
          { name: '🔵 Google',                  value: 'google' as LoginMethod },
          { name: '🍎 Apple ID',                value: 'apple' as LoginMethod },
        ],
      });
    }

    // ── Execute ───────────────────────────────────────────────────────
    if (method === 'email') {
      await loginWithEmail(opts.email);
    } else {
      await loginWithOAuth(method);
    }
  });
