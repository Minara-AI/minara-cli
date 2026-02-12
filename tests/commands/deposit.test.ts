/**
 * Integration tests for the deposit command.
 *
 * Mocks: config (requireAuth), API calls, inquirer prompts.
 * Verifies: auth check, API calls, output formatting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('../../src/config.js', () => ({
  requireAuth: vi.fn(),
  loadConfig: () => ({ baseUrl: 'https://api.minara.ai' }),
}));

vi.mock('../../src/api/auth.js', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('../../src/api/crosschain.js', () => ({
  getAccount: vi.fn(),
}));

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn().mockResolvedValue(false),
  input: vi.fn(),
  confirm: vi.fn(),
}));

// Suppress spinner + chalk output during tests
vi.mock('ora', () => ({
  default: () => ({ start: () => ({ stop: () => {}, text: '' }) }),
}));

import { requireAuth } from '../../src/config.js';
import { getCurrentUser } from '../../src/api/auth.js';
import { getAccount } from '../../src/api/crosschain.js';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetCurrentUser = vi.mocked(getCurrentUser);
const mockGetAccount = vi.mocked(getAccount);

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockReturnValue({
    accessToken: 'test-token',
    email: 'user@test.com',
  });
});

describe('deposit command', () => {
  it('should call requireAuth to verify login', async () => {
    mockGetCurrentUser.mockResolvedValue({
      success: true,
      data: {
        id: 'u1',
        wallets: { 'spot-evm': '0xEVM123', 'abstraction-solana': '9WzDXSol' },
      },
    });
    mockGetAccount.mockResolvedValue({ success: true, data: null });

    // Import the command and run it
    const { depositCommand } = await import('../../src/commands/deposit.js');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await depositCommand.parseAsync([], { from: 'user' });

    expect(mockRequireAuth).toHaveBeenCalledOnce();
    logSpy.mockRestore();
  });

  it('should fetch user wallets and account info in parallel', async () => {
    mockGetCurrentUser.mockResolvedValue({
      success: true,
      data: {
        id: 'u1',
        wallets: { 'spot-evm': '0xEVM' },
      },
    });
    mockGetAccount.mockResolvedValue({ success: true, data: {} });

    const { depositCommand } = await import('../../src/commands/deposit.js');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await depositCommand.parseAsync([], { from: 'user' });

    expect(mockGetCurrentUser).toHaveBeenCalledWith('test-token');
    expect(mockGetAccount).toHaveBeenCalledWith('test-token');
    logSpy.mockRestore();
  });

  it('should display wallet addresses when available', async () => {
    mockGetCurrentUser.mockResolvedValue({
      success: true,
      data: {
        id: 'u1',
        wallets: {
          'spot-evm': '0xEVM_ADDRESS',
          'abstraction-solana': 'SOLANA_ADDRESS',
        },
      },
    });
    mockGetAccount.mockResolvedValue({ success: true, data: null });

    const { depositCommand } = await import('../../src/commands/deposit.js');

    const output: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      output.push(args.join(' '));
    });

    await depositCommand.parseAsync([], { from: 'user' });

    const fullOutput = output.join('\n');
    // Should show the addresses somewhere in the output
    expect(fullOutput).toContain('0xEVM_ADDRESS');
    expect(fullOutput).toContain('SOLANA_ADDRESS');

    logSpy.mockRestore();
  });

  it('should show info message when no wallets exist', async () => {
    mockGetCurrentUser.mockResolvedValue({
      success: true,
      data: { id: 'u1', wallets: {} },
    });
    mockGetAccount.mockResolvedValue({ success: true, data: null });

    const { depositCommand } = await import('../../src/commands/deposit.js');

    const output: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      output.push(args.join(' '));
    });

    await depositCommand.parseAsync([], { from: 'user' });

    const fullOutput = output.join('\n');
    expect(fullOutput).toContain('No wallet addresses found');

    logSpy.mockRestore();
  });

  it('should handle API error gracefully', async () => {
    mockGetCurrentUser.mockResolvedValue({
      success: false,
      error: { code: 401, message: 'Token expired' },
    });
    mockGetAccount.mockResolvedValue({ success: true, data: null });

    const { depositCommand } = await import('../../src/commands/deposit.js');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(depositCommand.parseAsync([], { from: 'user' })).rejects.toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
