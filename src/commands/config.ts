import { Command } from 'commander';
import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { loadConfig, saveConfig, getMinaraDir } from '../config.js';
import { success, info, warn, wrapAction } from '../utils.js';
import { isTouchIdAvailable } from '../touchid.js';

export const configCommand = new Command('config')
  .description('View or update CLI configuration')
  .action(wrapAction(async () => {
    const config = loadConfig();

    const action = await select({
      message: 'Configuration:',
      choices: [
        { name: 'Show current config', value: 'show' },
        { name: 'Set base URL', value: 'baseUrl' },
        {
          name: `Touch ID  ${config.touchId ? chalk.green('[ON]') : chalk.dim('[OFF]')}`,
          value: 'touchId',
        },
        { name: 'Show config directory path', value: 'path' },
      ],
    });

    switch (action) {
      case 'show':
        console.log('');
        console.log(chalk.bold('Current Configuration:'));
        console.log(`  Base URL    : ${chalk.cyan(config.baseUrl)}`);
        console.log(`  Touch ID    : ${config.touchId ? chalk.green('Enabled') : chalk.dim('Disabled')}`);
        console.log(`  Config Dir  : ${chalk.dim(getMinaraDir())}`);
        console.log('');
        break;

      case 'baseUrl': {
        const url = await input({
          message: 'Base URL:',
          default: config.baseUrl,
          validate: (v) => {
            try { new URL(v); return true; } catch { return 'Please enter a valid URL'; }
          },
        });
        saveConfig({ baseUrl: url });
        success(`Base URL set to ${url}`);
        break;
      }

      case 'touchId': {
        if (config.touchId) {
          // Currently enabled — offer to disable
          const disable = await confirm({
            message: 'Touch ID is currently enabled. Disable it?',
            default: false,
          });
          if (disable) {
            saveConfig({ touchId: false });
            success('Touch ID protection disabled.');
          }
        } else {
          // Currently disabled — check availability then enable
          console.log('');
          info('Checking Touch ID availability…');

          if (!isTouchIdAvailable()) {
            console.log('');
            warn('Touch ID is not available on this device.');
            console.log(chalk.dim('  Make sure you are on a Mac with Touch ID and have enrolled at least one fingerprint.'));
            console.log('');
            break;
          }

          console.log(chalk.green('✔'), 'Touch ID hardware detected.');
          console.log('');
          console.log(chalk.dim('  When enabled, all fund-related operations (transfer, withdraw, swap, order, etc.)'));
          console.log(chalk.dim('  will require Touch ID verification before execution.'));
          console.log('');

          const enable = await confirm({
            message: 'Enable Touch ID protection?',
            default: true,
          });
          if (enable) {
            saveConfig({ touchId: true });
            success('Touch ID protection enabled!');
            console.log(chalk.dim('  All fund-related operations now require fingerprint verification.'));
          }
        }
        break;
      }

      case 'path':
        info(`Config directory: ${getMinaraDir()}`);
        break;
    }
  }));
