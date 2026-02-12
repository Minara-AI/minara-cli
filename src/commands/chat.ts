import { Command } from 'commander';
import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { sendChatStream, listChats, getMemories, deleteChat } from '../api/chat.js';
import { requireAuth } from '../config.js';
import { success, error, info, spinner } from '../utils.js';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';

/** Parse SSE stream and yield text chunks */
async function* parseSSE(response: Response): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          // Extract text content from various SSE event formats
          const text = parsed?.choices?.[0]?.delta?.content
            ?? parsed?.content
            ?? parsed?.text
            ?? parsed?.data?.text
            ?? (typeof parsed === 'string' ? parsed : null);
          if (text) yield text;
        } catch {
          // Non-JSON data line — might be raw text
          if (data && data !== '[DONE]') yield data;
        }
      }
    }
  }
}

export const chatCommand = new Command('chat')
  .description('Chat with Minara AI assistant')
  .argument('[message]', 'Send a single message (non-interactive)')
  .option('-c, --chat-id <id>', 'Continue existing chat')
  .option('--list', 'List past chats')
  .option('--history <chatId>', 'Show chat history')
  .option('--thinking', 'Enable thinking/degen mode')
  .option('--deep-research', 'Enable deep research mode')
  .action(async (messageArg?: string, opts?: {
    chatId?: string; list?: boolean; history?: string;
    thinking?: boolean; deepResearch?: boolean;
  }) => {
    const creds = requireAuth();

    // ── List chats ───────────────────────────────────────────────────────
    if (opts?.list) {
      const spin = spinner('Fetching chats…');
      const res = await listChats(creds.accessToken);
      spin.stop();
      if (!res.success || !res.data) { error(res.error?.message ?? 'Failed'); process.exit(1); }
      const chats = res.data as unknown as Array<{ chatId: string; name?: string; updatedAt?: string }>;
      if (!chats || chats.length === 0) {
        console.log(chalk.dim('No chats yet.'));
        return;
      }
      for (const c of chats) {
        console.log(`  ${chalk.bold((c.chatId ?? '').slice(0, 12))}…  ${c.name ?? '(untitled)'}  ${chalk.dim(c.updatedAt ?? '')}`);
      }
      return;
    }

    // ── Show history ─────────────────────────────────────────────────────
    if (opts?.history) {
      const spin = spinner('Loading history…');
      const res = await getMemories(creds.accessToken, opts.history);
      spin.stop();
      if (!res.success || !res.data) { error(res.error?.message ?? 'Failed'); process.exit(1); }
      const memories = res.data as unknown as Array<{ role: string; content: unknown }>;
      for (const m of memories) {
        const prefix = m.role === 'user' ? chalk.blue.bold('You   ') : chalk.green.bold('Minara');
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        console.log(`${prefix}: ${content}`);
      }
      return;
    }

    // ── Chat context ─────────────────────────────────────────────────────
    let chatId: string | undefined = opts?.chatId;

    if (!chatId && !messageArg) {
      const mode = await select({
        message: 'Chat mode:',
        choices: [
          { name: 'Start a new conversation', value: 'new' },
          { name: 'Continue existing conversation', value: 'continue' },
        ],
      });
      if (mode === 'continue') {
        const spin = spinner('Fetching chats…');
        const res = await listChats(creds.accessToken);
        spin.stop();
        const chats = res.data as unknown as Array<{ chatId: string; name?: string }>;
        if (chats && chats.length > 0) {
          chatId = await select({
            message: 'Select chat:',
            choices: chats.map((c) => ({
              name: `${(c.chatId ?? '').slice(0, 12)}…  ${c.name ?? '(untitled)'}`,
              value: c.chatId,
            })),
          });
        } else {
          info('No existing chats. Starting new.');
        }
      }
    }

    if (!chatId) chatId = randomUUID();

    // ── Send single message ──────────────────────────────────────────────
    async function sendAndPrint(msg: string) {
      process.stdout.write(`${chalk.green.bold('Minara')}: `);
      const response = await sendChatStream(creds.accessToken, {
        chatId,
        message: { role: 'user', content: msg },
        thinking: opts?.thinking,
        deepresearch: opts?.deepResearch,
        chartOptions: { chartsCountRecommendedLimit: 0 },
      });
      if (!response.ok) {
        const body = await response.text();
        console.log('');
        error(`API error ${response.status}: ${body}`);
        return;
      }
      for await (const chunk of parseSSE(response)) {
        process.stdout.write(chunk);
      }
      console.log('\n');
    }

    if (messageArg) {
      await sendAndPrint(messageArg);
      return;
    }

    // ── REPL ─────────────────────────────────────────────────────────────
    console.log('');
    console.log(chalk.bold('Minara AI Chat'));
    console.log(chalk.dim('Type your message. "exit" to quit, "/new" for new chat, "/help" for commands.'));
    console.log('');

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const prompt = (): Promise<string> => new Promise((resolve) => {
      rl.question(chalk.blue('You: '), resolve);
    });
    rl.on('close', () => { console.log(chalk.dim('\nGoodbye!')); process.exit(0); });

    while (true) {
      const userMsg = (await prompt()).trim();
      if (!userMsg) continue;
      if (userMsg.toLowerCase() === 'exit' || userMsg.toLowerCase() === 'quit') {
        console.log(chalk.dim('Goodbye!')); rl.close(); break;
      }
      if (userMsg === '/new') { chatId = randomUUID(); info('New conversation started.'); continue; }
      if (userMsg === '/id') { console.log(chalk.dim(`Chat ID: ${chatId}`)); continue; }
      if (userMsg === '/help') {
        console.log(chalk.dim('  /new  — New conversation\n  /id   — Show chat ID\n  exit  — Quit'));
        continue;
      }
      await sendAndPrint(userMsg);
    }
  });
