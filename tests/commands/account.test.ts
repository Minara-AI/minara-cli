/**
 * Integration tests for the account command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config.js', () => ({
  requireAuth: vi.fn(),
  loadConfig: () => ({ baseUrl: 'https://api.minara.ai' }),
}));

vi.mock('../../src/api/auth.js', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('ora', () => ({
  default: () => ({ start: () => ({ stop: () => {}, text: '' }) }),
}));

import { requireAuth } from '../../src/config.js';
import { getCurrentUser } from '../../src/api/auth.js';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetCurrentUser = vi.mocked(getCurrentUser);

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockReturnValue({ accessToken: 'tok123', email: 'me@test.com' });
});

describe('account command', () => {
  it('should call requireAuth and getCurrentUser', async () => {
    mockGetCurrentUser.mockResolvedValue({
      success: true,
      data: {
        id: 'user-42',
        displayName: 'Alice',
        email: 'alice@test.com',
        username: 'alice',
        invitationCode: 'INV123',
        wallets: { 'spot-evm': '0xWallet' },
        accounts: { google: {} },
      },
    });

    const { accountCommand } = await import('../../src/commands/account.js');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await accountCommand.parseAsync([], { from: 'user' });

    expect(mockRequireAuth).toHaveBeenCalledOnce();
    expect(mockGetCurrentUser).toHaveBeenCalledWith('tok123');
    logSpy.mockRestore();
  });

  it('should display user information', async () => {
    mockGetCurrentUser.mockResolvedValue({
      success: true,
      data: {
        id: 'user-42',
        displayName: 'Bob',
        email: 'bob@test.com',
        wallets: { 'spot-evm': '0xBobWallet', 'abstraction-solana': 'SolAddr' },
      },
    });

    const { accountCommand } = await import('../../src/commands/account.js');

    const output: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      output.push(args.join(' '));
    });

    await accountCommand.parseAsync([], { from: 'user' });

    const fullOutput = output.join('\n');
    expect(fullOutput).toContain('Bob');
    expect(fullOutput).toContain('bob@test.com');
    expect(fullOutput).toContain('0xBobWallet');
    expect(fullOutput).toContain('SolAddr');

    logSpy.mockRestore();
  });

  it('should handle API failure', async () => {
    mockGetCurrentUser.mockResolvedValue({
      success: false,
      error: { code: 500, message: 'Internal Server Error' },
    });

    const { accountCommand } = await import('../../src/commands/account.js');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      accountCommand.parseAsync([], { from: 'user' }),
    ).rejects.toThrow('exit');

    exitSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
