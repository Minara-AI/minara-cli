import { Command } from 'commander';
import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { createInterface } from 'node:readline';
import type { ChildProcess } from 'node:child_process';
import {
  VLLM_BASE_URL, VLLM_PORT, VLLM_LOG,
  getInstalledIds, getActiveId, getModelDef, setActiveModel,
  findPython, isServerRunning, startServerAttached, startServerDetached,
  stopServer, waitForServer, getServerInfo,
} from '../local-models.js';
import { installFlow, uninstallFlow, listModels } from './install.js';
import { error, info, success, warn, spinner, wrapAction } from '../utils.js';

// ─── Main command — interactive menu ────────────────────────────────────────

export const privateCommand = new Command('private')
  .description('Local DMind models — chat, install, load/unload (powered by vLLM)')
  .action(wrapAction(async () => {
    const running = await isServerRunning();
    const srvInfo = getServerInfo();
    const installed = getInstalledIds();

    const serverLabel = running && srvInfo
      ? chalk.green(`[ON] ${getModelDef(srvInfo.modelId)?.name ?? srvInfo.hfRepo}`)
      : chalk.dim('[OFF]');

    const action = await select({
      message: 'Private AI — select an action:',
      choices: [
        { name: `Chat with local model   ${serverLabel}`, value: 'chat' },
        { name: 'Load model              ' + chalk.dim('(start vLLM server)'), value: 'load' },
        { name: 'Unload model            ' + chalk.dim('(stop vLLM server)'), value: 'unload' },
        { name: 'Status', value: 'status' },
        { name: chalk.dim('────────────────────────'), value: '_sep', disabled: true },
        { name: 'Install model', value: 'install' },
        { name: 'Remove model', value: 'remove' },
        { name: 'List models', value: 'models' },
      ],
    });

    switch (action) {
      case 'chat': await chatFlow(); break;
      case 'load': await loadFlow(); break;
      case 'unload': await unloadFlow(); break;
      case 'status': await statusFlow(); break;
      case 'install': await installFlow(); break;
      case 'remove': await uninstallFlow(); break;
      case 'models': listModels(); break;
    }
  }));

// ─── Subcommands ────────────────────────────────────────────────────────────

privateCommand
  .command('chat')
  .description('Chat with a locally loaded DMind model')
  .argument('[message]', 'Send a single message and exit')
  .action(wrapAction(async (messageArg?: string) => { await chatFlow(messageArg); }));

privateCommand
  .command('install')
  .description('Download a DMind model from Hugging Face')
  .action(wrapAction(async () => { await installFlow(); }));

privateCommand
  .command('remove')
  .description('Uninstall a downloaded model')
  .action(wrapAction(async () => { await uninstallFlow(); }));

privateCommand
  .command('models')
  .description('List available and installed models')
  .action(wrapAction(async () => { listModels(); }));

privateCommand
  .command('load')
  .description('Load a model into memory (start vLLM server in background)')
  .action(wrapAction(async () => { await loadFlow(); }));

privateCommand
  .command('unload')
  .description('Unload model from memory (stop vLLM server)')
  .action(wrapAction(async () => { await unloadFlow(); }));

privateCommand
  .command('status')
  .description('Show current server and model status')
  .action(wrapAction(async () => { await statusFlow(); }));

// ─── Load / Unload / Status flows ──────────────────────────────────────────

async function loadFlow(): Promise<void> {
  const installed = getInstalledIds();
  if (installed.length === 0) {
    warn('No models installed.');
    info(`Run ${chalk.cyan('minara private install')} first.`);
    return;
  }

  if (await isServerRunning()) {
    const srv = getServerInfo();
    const name = srv ? getModelDef(srv.modelId)?.name ?? srv.hfRepo : 'unknown';
    warn(`Server already running with ${chalk.bold(name)}.`);
    info(`Run ${chalk.cyan('minara private unload')} first to switch models.`);
    return;
  }

  const py = findPython();
  if (!py) { error('Python 3 is required.'); return; }

  let modelId = getActiveId() ?? installed[0];
  if (installed.length > 1) {
    modelId = await select({
      message: 'Select model to load:',
      choices: installed.map((id) => {
        const def = getModelDef(id);
        return { name: def ? `${def.name} ${chalk.dim(`(${def.params})`)}` : id, value: id };
      }),
      default: modelId,
    });
  }

  const model = getModelDef(modelId);
  if (!model) { error('Model not found.'); return; }
  setActiveModel(modelId);

  info(`Loading ${chalk.bold(model.name)} in background…`);
  console.log(chalk.dim(`  Logs: ${VLLM_LOG}`));
  startServerDetached(py, model.id, model.hfRepo);

  const spin = spinner('Starting vLLM server…');
  const ready = await waitForServer();
  spin.stop();

  if (ready) {
    success(`${chalk.bold(model.name)} loaded and serving on port ${VLLM_PORT}`);
    info(`Chat: ${chalk.cyan('minara private chat')}`);
    info(`Stop: ${chalk.cyan('minara private unload')}`);
  } else {
    error('Server failed to start in time.');
    console.log(chalk.dim(`  Check logs: ${VLLM_LOG}`));
  }
}

async function unloadFlow(): Promise<void> {
  if (!(await isServerRunning())) {
    info('No model server is currently running.');
    return;
  }

  const srv = getServerInfo();
  const name = srv ? getModelDef(srv.modelId)?.name ?? srv.hfRepo : 'model';
  stopServer();

  await new Promise((r) => setTimeout(r, 500));
  success(`${chalk.bold(name)} unloaded — server stopped.`);
}

async function statusFlow(): Promise<void> {
  const running = await isServerRunning();
  const srv = getServerInfo();
  const installed = getInstalledIds();

  console.log('');
  console.log(chalk.bold('  Local Model Status'));
  console.log(chalk.dim('  ─'.repeat(24)));
  console.log('');
  console.log(`  Server     ${running ? chalk.green.bold('Running') : chalk.dim('Stopped')}`);
  if (running && srv) {
    const def = getModelDef(srv.modelId);
    console.log(`  Model      ${chalk.bold(def?.name ?? srv.hfRepo)} ${chalk.dim(`(${def?.params ?? '?'})`)}`);
    console.log(`  Port       ${chalk.cyan(String(VLLM_PORT))}`);
    console.log(`  PID        ${chalk.dim(String(srv.pid))}`);
    console.log(`  Started    ${chalk.dim(srv.startedAt)}`);
  }
  console.log(`  Installed  ${installed.length === 0 ? chalk.dim('none') : installed.map((id) => getModelDef(id)?.name ?? id).join(', ')}`);
  console.log(`  Logs       ${chalk.dim(VLLM_LOG)}`);
  console.log('');
}

// ─── Chat flow ──────────────────────────────────────────────────────────────

async function chatFlow(messageArg?: string): Promise<void> {
  const installed = getInstalledIds();
  if (installed.length === 0) {
    warn('No local models installed.');
    info(`Run ${chalk.cyan('minara private install')} to download a DMind model first.`);
    return;
  }

  const running = await isServerRunning();
  const srv = getServerInfo();

  // Determine which model to use
  let model = srv ? getModelDef(srv.modelId) : undefined;
  if (!model) model = getModelDef(getActiveId() ?? installed[0]);
  if (!model) { error('Model not found.'); return; }

  // If server is not running, start an attached session
  let attachedProc: ChildProcess | null = null;
  if (!running) {
    const py = findPython();
    if (!py) { error('Python 3 is required to run local models.'); return; }

    info(`No loaded model. Starting ${chalk.bold(model.name)} for this session…`);
    console.log(chalk.dim('  Tip: use `minara private load` to keep the server running between chats.'));
    console.log('');

    attachedProc = startServerAttached(py, model.hfRepo);

    let stderrBuf = '';
    attachedProc.stderr?.on('data', (d: Buffer) => { stderrBuf += d.toString(); });
    attachedProc.on('exit', (code) => {
      if (code && code !== 0) {
        console.log('');
        error('vLLM server exited unexpectedly.');
        if (stderrBuf) console.log(chalk.dim(stderrBuf.slice(-500)));
      }
    });

    const spin = spinner('Loading model (this may take a moment)…');
    const ready = await waitForServer();
    spin.stop();

    if (!ready) {
      error('Server did not become ready in time.');
      attachedProc.kill();
      return;
    }
    success('Model loaded');
  } else {
    info(`Using loaded model: ${chalk.bold(model.name)} ${chalk.dim(`(${model.params})`)}`);
  }

  const cleanup = () => {
    if (attachedProc && !attachedProc.killed) {
      attachedProc.kill('SIGTERM');
    }
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    // Single-shot mode
    if (messageArg) {
      await sendAndPrint(model.hfRepo, messageArg);
      return;
    }

    // Interactive REPL
    console.log('');
    console.log(
      chalk.green.bold('Private Chat') + chalk.dim(` · ${model.name} (${model.params})`),
    );
    console.log(chalk.dim('─'.repeat(50)));
    console.log(chalk.dim('Your data stays local. Type a message, Ctrl+C to exit.'));
    console.log('');

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (): Promise<string> =>
      new Promise((resolve) => rl.question(chalk.blue.bold('>>> '), resolve));

    const history: { role: string; content: string }[] = [];

    rl.on('close', () => {
      console.log(chalk.dim('\nGoodbye!'));
      cleanup();
      process.exit(0);
    });

    while (true) {
      const userMsg = (await ask()).trim();
      if (!userMsg) continue;
      if (userMsg.toLowerCase() === 'exit' || userMsg.toLowerCase() === 'quit') {
        console.log(chalk.dim('Goodbye!'));
        rl.close();
        break;
      }

      if (userMsg === '/new') {
        history.length = 0;
        info('Conversation cleared.');
        continue;
      }

      if (userMsg === '/help') {
        console.log('');
        console.log(chalk.bold('  Commands:'));
        console.log(chalk.dim('  /new        ') + 'Clear conversation history');
        console.log(chalk.dim('  exit        ') + 'Quit the chat');
        console.log('');
        continue;
      }

      history.push({ role: 'user', content: userMsg });
      rl.pause();
      try {
        const reply = await sendAndPrint(model.hfRepo, userMsg, history);
        if (reply) history.push({ role: 'assistant', content: reply });
      } finally {
        rl.resume();
        process.stdout.write('\n');
      }
    }
  } finally {
    cleanup();
  }
}

// ─── Streaming chat with local vLLM ────────────────────────────────────────

async function sendAndPrint(
  modelName: string,
  message: string,
  history?: { role: string; content: string }[],
): Promise<string> {
  const messages = history
    ? [...history]
    : [{ role: 'user', content: message }];

  process.stdout.write(chalk.green.bold('DMind') + chalk.dim(': '));

  try {
    const res = await fetch(`${VLLM_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages,
        stream: true,
        max_tokens: 2048,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.log('');
      error(`Local model error ${res.status}: ${body}`);
      return '';
    }

    const reader = res.body?.getReader();
    if (!reader) { console.log(chalk.dim('(no response)')); return ''; }

    let fullReply = '';
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          const content = parsed?.choices?.[0]?.delta?.content;
          if (content) {
            process.stdout.write(content);
            fullReply += content;
          }
        } catch { /* skip malformed chunks */ }
      }
    }

    console.log('\n');
    return fullReply;
  } catch (err) {
    console.log('');
    error(err instanceof Error ? err.message : String(err));
    return '';
  }
}
