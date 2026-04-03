import { select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import {
  AVAILABLE_MODELS, getInstalledIds, getModelDef,
  markInstalled, markUninstalled,
  findPython, hasVllm, hasHfHub,
  pipInstall, downloadModel, clearModelCache,
  isAppleSilicon, getArchLabel, fixNativeDeps,
} from '../local-models.js';
import { error, info, success, warn, spinner } from '../utils.js';

// ─── List ───────────────────────────────────────────────────────────────────

export function listModels(): void {
  const installed = getInstalledIds();
  console.log('');
  console.log(chalk.bold('  DMind Models'));
  console.log(chalk.dim('  ─'.repeat(24)));
  console.log('');
  for (const m of AVAILABLE_MODELS) {
    const status = installed.includes(m.id)
      ? chalk.green(' [installed]')
      : '';
    const rec = m.recommended ? chalk.yellow(' ★ recommended') : '';
    console.log(`  ${chalk.bold(m.name)} ${chalk.dim(`(${m.params})`)}${rec}${status}`);
    console.log(chalk.dim(`    https://huggingface.co/${m.hfRepo}`));
    console.log('');
  }
}

// ─── Install ────────────────────────────────────────────────────────────────

export async function installFlow(): Promise<void> {
  const py = ensurePython();
  if (!py) return;
  if (!(await ensureDeps(py))) return;

  const installed = getInstalledIds();
  const candidates = AVAILABLE_MODELS.filter((m) => !installed.includes(m.id));
  if (candidates.length === 0) {
    info('All models are already installed.');
    return;
  }

  const defaultModel = candidates.find((m) => m.recommended) ?? candidates[0];
  const model = await select({
    message: 'Select a model to install:',
    choices: candidates.map((m) => ({
      name: `${m.name} ${chalk.dim(`(${m.params})`)}${m.recommended ? chalk.yellow(' ★ recommended') : ''}`,
      value: m,
    })),
    default: defaultModel,
  });

  console.log('');
  info(`Downloading ${chalk.bold(model.name)} from Hugging Face…`);
  console.log(chalk.dim(`  https://huggingface.co/${model.hfRepo}`));
  console.log('');

  if (!downloadModel(py, model.hfRepo)) {
    error('Download failed. Check your network connection and try again.');
    return;
  }

  markInstalled(model.id);
  console.log('');
  success(`${chalk.bold(model.name)} installed successfully!`);
  info(`Start a private chat: ${chalk.cyan('minara private chat')}`);
}

// ─── Uninstall ──────────────────────────────────────────────────────────────

export async function uninstallFlow(): Promise<void> {
  const installed = getInstalledIds();
  if (installed.length === 0) {
    info('No models installed.');
    return;
  }

  const choices = installed.map((id) => {
    const def = getModelDef(id);
    return { name: def ? `${def.name} (${def.params})` : id, value: id };
  });

  const modelId = await select({ message: 'Select model to uninstall:', choices });
  const def = getModelDef(modelId);
  const ok = await confirm({
    message: `Uninstall ${def?.name ?? modelId}?`,
    default: false,
  });
  if (!ok) return;

  markUninstalled(modelId);

  const py = findPython();
  if (py && def) {
    const spin = spinner('Removing cached model files…');
    const cleared = clearModelCache(py, def.hfRepo);
    spin.stop();
    if (cleared) {
      success(`${def.name} uninstalled and cache cleared.`);
    } else {
      success(`${def.name} uninstalled.`);
      warn('Could not clear HuggingFace cache automatically.');
      console.log(chalk.dim('  Run `huggingface-cli delete-cache` to free disk space.'));
    }
  } else {
    success(`${def?.name ?? modelId} uninstalled.`);
  }
}

// ─── Prerequisite helpers ───────────────────────────────────────────────────

function ensurePython(): string | null {
  const py = findPython();
  if (!py) {
    error('Python 3 is required. Please install Python 3.8+ first.');
    console.log(chalk.dim('  https://www.python.org/downloads/'));
    return null;
  }
  info(`Python found · ${chalk.dim(getArchLabel())}`);
  return py;
}

async function ensureDeps(py: string): Promise<boolean> {
  if (!hasVllm(py)) {
    warn('vLLM is not installed.');
    const ok = await confirm({ message: 'Install vLLM now? (pip install vllm)', default: true });
    if (!ok) {
      info('Skipped. Install manually: pip install vllm');
      return false;
    }
    if (!pipInstall(py, 'vllm')) {
      error('Failed to install vLLM. Try manually: pip install vllm');
      return false;
    }
    success('vLLM installed');
  }

  if (!hasHfHub(py)) {
    warn('huggingface_hub is not installed.');
    const ok = await confirm({ message: 'Install huggingface_hub now?', default: true });
    if (!ok) {
      info('Skipped. Install manually: pip install huggingface_hub');
      return false;
    }
    if (!pipInstall(py, 'huggingface_hub')) {
      error('Failed to install. Try: pip install huggingface_hub');
      return false;
    }
    success('huggingface_hub installed');
  }

  // On Apple Silicon, scan all native extensions and fix x86_64 mismatches
  if (isAppleSilicon()) {
    info('Scanning native extensions for arm64 compatibility…');
    const fixed = fixNativeDeps(py);
    if (fixed.length > 0) {
      success(`Fixed ${fixed.length} package(s) for arm64: ${chalk.dim(fixed.join(', '))}`);
    } else {
      success('All native extensions are arm64 compatible');
    }
  }

  return true;
}
