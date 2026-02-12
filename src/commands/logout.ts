import { Command } from 'commander';
import { confirm } from '@inquirer/prompts';
import { logout as logoutApi } from '../api/auth.js';
import { loadCredentials, clearCredentials } from '../config.js';
import { success, warn, spinner } from '../utils.js';

export const logoutCommand = new Command('logout')
  .description('Logout from your Minara account')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (opts: { yes?: boolean }) => {
    const creds = loadCredentials();
    if (!creds?.accessToken) {
      warn('You are not logged in.');
      return;
    }

    if (!opts.yes) {
      const confirmed = await confirm({
        message: 'Are you sure you want to logout?',
        default: false,
      });
      if (!confirmed) return;
    }

    const spin = spinner('Logging out…');
    try { await logoutApi(creds.accessToken); } catch { /* ignore */ }
    clearCredentials();
    spin.succeed('Logged out');
    success('Local credentials cleared.');
  });
