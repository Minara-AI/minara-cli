/**
 * Integration tests for the chat, ask, and research commands.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config.js', () => ({
  requireAuth: vi.fn(),
  loadConfig: () => ({ baseUrl: 'https://api.minara.ai', confirmBeforeTransaction: false }),
}));

vi.mock('../../src/api/chat.js', () => ({
  sendChatStream: vi.fn(),
  listChats: vi.fn(),
  getMemories: vi.fn(),
}));

vi.mock('ora', () => ({
  default: () => ({ start: () => ({ stop: () => {}, text: '' }) }),
}));

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
}));

import { requireAuth } from '../../src/config.js';
import { sendChatStream } from '../../src/api/chat.js';

const mockRequireAuth = vi.mocked(requireAuth);
const mockSendChatStream = vi.mocked(sendChatStream);

/** Build a minimal SSE Response mock for single-shot chat */
function mockSSEResponse(text: string): Response {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`0:${JSON.stringify(text)}\n`));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  mockRequireAuth.mockReturnValue({
    accessToken: 'test-token',
    email: 'user@test.com',
  });
});

describe('ask command', () => {
  it('should call requireAuth', async () => {
    mockSendChatStream.mockResolvedValueOnce(mockSSEResponse('Hello'));

    const { askCommand } = await import('../../src/commands/chat.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await askCommand.parseAsync(['What is BTC?'], { from: 'user' });

    expect(mockRequireAuth).toHaveBeenCalledOnce();
    logSpy.mockRestore();
    writeSpy.mockRestore();
  });

  it('should call sendChatStream with fast workMode', async () => {
    mockSendChatStream.mockResolvedValueOnce(mockSSEResponse('BTC is $100k'));

    const { askCommand } = await import('../../src/commands/chat.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await askCommand.parseAsync(['What is BTC price?'], { from: 'user' });

    expect(mockSendChatStream).toHaveBeenCalledOnce();
    const callArgs = mockSendChatStream.mock.calls[0];
    expect(callArgs[0]).toBe('test-token');
    expect(callArgs[1]).toMatchObject({
      message: { role: 'user', content: 'What is BTC price?' },
      workMode: 'fast',
    });

    logSpy.mockRestore();
    writeSpy.mockRestore();
  });

  it('should pass --thinking flag through', async () => {
    mockSendChatStream.mockResolvedValueOnce(mockSSEResponse('thinking…'));

    const { askCommand } = await import('../../src/commands/chat.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await askCommand.parseAsync(['--thinking', 'Analyze SOL'], { from: 'user' });

    const callArgs = mockSendChatStream.mock.calls[0];
    expect(callArgs[1]).toMatchObject({
      thinking: true,
      workMode: 'fast',
    });

    logSpy.mockRestore();
    writeSpy.mockRestore();
  });
});

describe('research command', () => {
  it('should call requireAuth', async () => {
    mockSendChatStream.mockResolvedValueOnce(mockSSEResponse('Deep analysis'));

    const { researchCommand } = await import('../../src/commands/chat.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await researchCommand.parseAsync(['Analyze ETH'], { from: 'user' });

    expect(mockRequireAuth).toHaveBeenCalledOnce();
    logSpy.mockRestore();
    writeSpy.mockRestore();
  });

  it('should call sendChatStream with quality workMode', async () => {
    mockSendChatStream.mockResolvedValueOnce(mockSSEResponse('Deep ETH analysis'));

    const { researchCommand } = await import('../../src/commands/chat.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await researchCommand.parseAsync(['Analyze ETH outlook'], { from: 'user' });

    expect(mockSendChatStream).toHaveBeenCalledOnce();
    const callArgs = mockSendChatStream.mock.calls[0];
    expect(callArgs[0]).toBe('test-token');
    expect(callArgs[1]).toMatchObject({
      message: { role: 'user', content: 'Analyze ETH outlook' },
      workMode: 'quality',
    });

    logSpy.mockRestore();
    writeSpy.mockRestore();
  });

  it('should pass --thinking flag through', async () => {
    mockSendChatStream.mockResolvedValueOnce(mockSSEResponse('thinking…'));

    const { researchCommand } = await import('../../src/commands/chat.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await researchCommand.parseAsync(['--thinking', 'Compare L2s'], { from: 'user' });

    const callArgs = mockSendChatStream.mock.calls[0];
    expect(callArgs[1]).toMatchObject({
      thinking: true,
      workMode: 'quality',
    });

    logSpy.mockRestore();
    writeSpy.mockRestore();
  });
});
