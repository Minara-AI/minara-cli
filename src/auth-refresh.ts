/**
 * Session refresh module.
 *
 * When the API returns 401, this module provides an interactive re-login
 * flow so the user doesn't have to manually run `minara login` again.
 *
 * Imported DYNAMICALLY by api/client.ts to avoid circular dependencies:
 *   client.ts → (dynamic) auth-refresh.ts → api/auth.ts → client.ts
 */

import { confirm, input } from '@inquirer/prompts';
import chalk from 'chalk';
import { loadCredentials, saveCredentials } from './config.js';
import { sendEmailCode, verifyEmailCode } from './api/auth.js';

/**
 * Attempt to re-authenticate interactively.
 *
 * @returns The new access token on success, or `null` on failure / user decline.
 */
export async function attemptReAuth(): Promise<string | null> {
  try {
    console.log('');
    console.log(
      chalk.yellow('⚠'),
      chalk.yellow('Your session has expired or is invalid.'),
    );

    // ── Ask user whether to re-login ──────────────────────────────────
    const wantReLogin = await confirm({
      message: 'Would you like to re-login now?',
      default: true,
    });

    if (!wantReLogin) {
      console.log(chalk.dim('Run `minara login` to manually refresh your session.'));
      return null;
    }
    // ── Determine email ─────────────────────────────────────────────────
    const creds = loadCredentials();
    let email = creds?.email;

    if (!email) {
      email = await input({
        message: 'Email address:',
        validate: (v) => (v.includes('@') ? true : 'Enter a valid email'),
      });
    } else {
      console.log(chalk.dim(`Sending verification code to ${email}…`));
    }

    // ── Send code ───────────────────────────────────────────────────────
    const codeRes = await sendEmailCode({ email, platform: 'web' });

    if (!codeRes.success) {
      console.error(
        chalk.red('✖'),
        `Failed to send code: ${codeRes.error?.message ?? 'Unknown error'}`,
      );
      return null;
    }

    console.log(chalk.green('✔'), `Verification code sent to ${chalk.cyan(email)}`);

    // ── Get code from user ──────────────────────────────────────────────
    const code = await input({
      message: 'Enter verification code:',
      validate: (v) => (v.length > 0 ? true : 'Code is required'),
    });

    // ── Verify ──────────────────────────────────────────────────────────
    const verifyRes = await verifyEmailCode({
      email,
      code,
      channel: 'web',
      deviceType: 'desktop',
    });

    if (!verifyRes.success || !verifyRes.data) {
      console.error(
        chalk.red('✖'),
        `Verification failed: ${verifyRes.error?.message ?? 'Invalid code'}`,
      );
      return null;
    }

    const user = verifyRes.data;
    const newToken = user.access_token;

    if (!newToken) {
      console.error(chalk.red('✖'), 'No access token in response.');
      return null;
    }

    // ── Save new credentials ────────────────────────────────────────────
    saveCredentials({
      accessToken: newToken,
      userId: user.id,
      email: user.email ?? email,
      displayName: user.displayName,
    });

    console.log(chalk.green('✔'), 'Re-login successful! Retrying your request…');
    console.log('');

    return newToken;
  } catch (err) {
    // Handle Ctrl+C or closed prompt
    if (err instanceof Error && (err.message.includes('closed') || err.message.includes('aborted'))) {
      console.log(chalk.dim('\nRe-login cancelled.'));
    } else {
      console.error(
        chalk.red('✖'),
        `Re-login error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return null;
  }
}
