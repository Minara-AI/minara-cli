import { Command } from 'commander';
import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { loadConfig, saveConfig, getMinaraDir } from '../config.js';
import { success, info } from '../utils.js';

export const configCommand = new Command('config')
  .description('View or update CLI configuration')
  .action(async () => {
    const action = await select({
      message: 'Configuration:',
      choices: [
        { name: 'Show current config', value: 'show' },
        { name: 'Set base URL', value: 'baseUrl' },
        { name: 'Show config directory path', value: 'path' },
      ],
    });

    const config = loadConfig();

    switch (action) {
      case 'show':
        console.log('');
        console.log(chalk.bold('Current Configuration:'));
        console.log(`  Base URL    : ${chalk.cyan(config.baseUrl)}`);
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

      case 'path':
        info(`Config directory: ${getMinaraDir()}`);
        break;
    }
  });
