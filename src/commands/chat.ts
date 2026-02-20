import { Command } from 'commander';
import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { sendChatStream, listChats, getMemories } from '../api/chat.js';
import { requireAuth } from '../config.js';
import { error, info, spinner, unwrapApi, wrapAction } from '../utils.js';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';

/** Parse SSE stream and yield text chunks */
async function* parseSSE(response: Response): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line) continue;

        // Handle AI SDK v5 streaming format: "type:value"
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
          const type = line.slice(0, colonIndex);
          const data = line.slice(colonIndex + 1);

          if (type === '0' && data) {
            try {
              const parsed = JSON.parse(data);
              if (typeof parsed === 'string') {
                yield parsed;
              } else if (parsed.text) {
                yield parsed.text;
              } else if (parsed.content) {
                yield parsed.content;
              }
            } catch {
              yield data;
            }
          }
          continue;
        }

        // Handle standard SSE format: "data:json"
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            const text = parsed?.choices?.[0]?.delta?.content
              ?? parsed?.content
              ?? parsed?.text
              ?? parsed?.data?.text
              ?? (typeof parsed === 'string' ? parsed : null);
            if (text) yield text;
          } catch {
            if (data) yield data;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export const chatCommand = new Command('chat')
  .description('Chat with Minara AI assistant (interactive REPL when no message given)')
  .argument('[message]', 'Send a single message and exit')
  .option('-c, --chat-id <id>', 'Continue existing chat')
  .option('--list', 'List past chats')
  .option('--history <chatId>', 'Show chat history')
  .option('--thinking', 'Enable thinking/degen mode')
  .option('--quality', 'Use quality mode instead of the default fast mode')
  .action(wrapAction(async (messageArg?: string, opts?: {
    chatId?: string; list?: boolean; history?: string;
    thinking?: boolean; quality?: boolean;
  }) => {
    const creds = requireAuth();

    // ── List chats ───────────────────────────────────────────────────────
    if (opts?.list) {
      const spin = spinner('Fetching chats…');
      const res = await listChats(creds.accessToken);
      spin.stop();
      const chats = unwrapApi(res, 'Failed to fetch chats');
      if (chats.length === 0) {
        console.log(chalk.dim('No chats yet.'));
        return;
      }
      for (const c of chats) {
        console.log(`  ${chalk.bold((c.chatId).slice(0, 12))}…  ${c.name ?? '(untitled)'}  ${chalk.dim(c.updatedAt ?? '')}`);
      }
      return;
    }

    // ── Show history ─────────────────────────────────────────────────────
    if (opts?.history) {
      const spin = spinner('Loading history…');
      const res = await getMemories(creds.accessToken, opts.history);
      spin.stop();
      const memories = unwrapApi(res, 'Failed to load chat history');
      for (const m of memories) {
        const prefix = m.role === 'user' ? chalk.blue.bold('You   ') : chalk.green.bold('Minara');
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        console.log(`${prefix}: ${content}`);
      }
      return;
    }

    // ── Chat context ─────────────────────────────────────────────────────
    let chatId: string | undefined = opts?.chatId;
    if (!chatId) chatId = randomUUID();

    // ── Stream a response and print to stdout ────────────────────────────
    async function sendAndPrint(msg: string) {
      process.stdout.write(chalk.green.bold('Minara') + chalk.dim(': '));
      const response = await sendChatStream(creds.accessToken, {
        chatId,
        message: { role: 'user', content: msg },
        thinking: opts?.thinking,
        workMode: opts?.quality ? 'quality' : 'fast',
        chartOptions: { chartsCountRecommendedLimit: 0 },
      });
      if (!response.ok) {
        const body = await response.text();
        console.log('');
        error(`API error ${response.status}: ${body}`);
        return;
      }

      // Debug: Check if response body exists
      if (!response.body) {
        console.log(chalk.dim('(No response body)'));
        return;
      }

      let hasContent = false;
      try {
        for await (const chunk of parseSSE(response)) {
          if (chunk) {
            process.stdout.write(chunk);
            hasContent = true;
          }
        }
      } catch (err) {
        // Ignore cancellation errors
        if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
          return;
        }
        if (process.env.DEBUG) {
          console.log(chalk.dim(`\n[Stream error: ${err}]`));
        }
      }

      if (!hasContent) {
        console.log(chalk.dim('(No response content)'));
      }
      console.log('\n');
    }

    // ── Single-shot mode: minara chat "message" ──────────────────────────
    if (messageArg) {
      await sendAndPrint(messageArg);
      return;
    }

    // ── Interactive REPL mode ────────────────────────────────────────────
    const modeFlags = [
      opts?.quality ? chalk.cyan('quality') : chalk.green('fast'),
      opts?.thinking && chalk.yellow('thinking'),
    ].filter(Boolean);
    const modeStr = modeFlags.length ? ` ${chalk.dim('[')}${modeFlags.join(chalk.dim(', '))}${chalk.dim(']')}` : '';

    console.log('');
    console.log(
      chalk.green.bold('Minara AI Chat') +
      chalk.dim(` session:${chatId.slice(0, 8)}`) +
      modeStr,
    );
    console.log(chalk.dim('─'.repeat(50)));
    console.log(chalk.dim('Type a message to chat. /help for commands, Ctrl+C to exit.'));
    console.log('');

    const rl = createInterface({ input: process.stdin, output: process.stdout });

    async function sendAndPrintWithPause(msg: string) {
      rl.pause();
      try {
        await sendAndPrint(msg);
      } finally {
        rl.resume();
        process.stdout.write('\n');
      }
    }

    const ask = (): Promise<string> =>
      new Promise((resolve) => rl.question(chalk.blue.bold('>>> '), resolve));

    rl.on('close', () => {
      console.log(chalk.dim('\nGoodbye!'));
      process.exit(0);
    });

    while (true) {
      const userMsg = (await ask()).trim();
      if (!userMsg) continue;

      // ── REPL commands ──────────────────────────────────────────────────
      if (userMsg.toLowerCase() === 'exit' || userMsg.toLowerCase() === 'quit') {
        console.log(chalk.dim('Goodbye!'));
        rl.close();
        break;
      }

      if (userMsg === '/new') {
        chatId = randomUUID();
        info(`New conversation started ${chalk.dim(`(session:${chatId.slice(0, 8)})`)}`);
        continue;
      }

      if (userMsg === '/id') {
        console.log(chalk.dim(`Chat ID: ${chatId}`));
        continue;
      }

      if (userMsg === '/continue') {
        const spin = spinner('Fetching chats…');
        const res = await listChats(creds.accessToken);
        spin.stop();
        const chats = res.data;
        if (chats && chats.length > 0) {
          const selected = await select({
            message: 'Select a chat to continue:',
            choices: chats.map((c) => ({
              name: `${(c.chatId).slice(0, 12)}…  ${c.name ?? '(untitled)'}`,
              value: c.chatId,
            })),
          });
          chatId = selected;
          info(`Continuing chat ${chalk.dim(`(session:${chatId.slice(0, 8)})`)}`);
        } else {
          info('No existing chats found.');
        }
        continue;
      }

      if (userMsg === '/list') {
        const spin = spinner('Fetching chats…');
        const res = await listChats(creds.accessToken);
        spin.stop();
        const chats = res.data;
        if (chats && chats.length > 0) {
          console.log('');
          for (const c of chats) {
            const id = chalk.dim(c.chatId.slice(0, 8));
            const name = c.name ?? chalk.dim('(untitled)');
            const time = c.updatedAt ? chalk.dim(` ${c.updatedAt}`) : '';
            console.log(`  ${id}  ${name}${time}`);
          }
          console.log('');
        } else {
          info('No chats yet.');
        }
        continue;
      }

      if (userMsg === '/help') {
        console.log('');
        console.log(chalk.bold('  Commands:'));
        console.log(chalk.dim('  /new        ') + 'Start a new conversation');
        console.log(chalk.dim('  /continue   ') + 'Continue an existing conversation');
        console.log(chalk.dim('  /list       ') + 'List all historical chats');
        console.log(chalk.dim('  /id         ') + 'Show current chat ID');
        console.log(chalk.dim('  exit        ') + 'Quit the chat');
        console.log('');
        continue;
      }
      await sendAndPrintWithPause(userMsg);
    }
  }));
