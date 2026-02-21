/**
 * Integration tests for the deposit command.
 *
 * Tests spot (address display) and perps (address display + spot→perps transfer) flows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config.js', () => ({
  requireAuth: vi.fn(),
  loadConfig: () => ({ baseUrl: 'https://api.minara.ai', confirmBeforeTransaction: false }),
}));

vi.mock('../../src/api/crosschain.js', () => ({
  getAccount: vi.fn(),
}));

vi.mock('../../src/api/auth.js', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('../../src/api/perps.js', () => ({
  deposit: vi.fn(),
}));

vi.mock('../../src/touchid.js', () => ({
  requireTouchId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  input: vi.fn(),
  confirm: vi.fn(),
  number: vi.fn(),
}));

vi.mock('ora', () => ({
  default: () => ({ start: () => ({ stop: () => {}, text: '' }) }),
}));

vi.mock('../../src/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils.js')>();
  return {
    ...actual,
    requireTransactionConfirmation: vi.fn().mockResolvedValue(undefined),
  };
});

import { requireAuth } from '../../src/config.js';
import { getAccount } from '../../src/api/crosschain.js';
import { getCurrentUser } from '../../src/api/auth.js';
import * as perpsApi from '../../src/api/perps.js';
import { select, confirm, number as numberPrompt } from '@inquirer/prompts';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetAccount = vi.mocked(getAccount);
const mockGetCurrentUser = vi.mocked(getCurrentUser);
const mockPerpsDeposit = vi.mocked(perpsApi.deposit);
const mockSelect = vi.mocked(select);
const mockConfirm = vi.mocked(confirm);
const mockNumber = vi.mocked(numberPrompt);

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockReturnValue({
    accessToken: 'test-token',
    email: 'user@test.com',
  });
});

describe('deposit command', () => {
  describe('deposit spot', () => {
    it('should call requireAuth to verify login', async () => {
      mockGetAccount.mockResolvedValue({
        success: true,
        data: { evmAddress: '0xEVM', solanaAddress: 'SOL123' },
      });

      const { depositCommand } = await import('../../src/commands/deposit.js');
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await depositCommand.commands.find((c) => c.name() === 'spot')!.parseAsync([], { from: 'user' });

      expect(mockRequireAuth).toHaveBeenCalledOnce();
      logSpy.mockRestore();
    });

    it('should display EVM and Solana deposit addresses', async () => {
      mockGetAccount.mockResolvedValue({
        success: true,
        data: { evmAddress: '0xABCDEF', solanaAddress: '3aYrSolana' },
      });

      const { depositCommand } = await import('../../src/commands/deposit.js');
      const output: string[] = [];
      const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
        output.push(args.join(' '));
      });

      await depositCommand.commands.find((c) => c.name() === 'spot')!.parseAsync([], { from: 'user' });
      const fullOutput = output.join('\n');

      expect(fullOutput).toContain('0xABCDEF');
      expect(fullOutput).toContain('3aYrSolana');
      expect(fullOutput).toContain('EVM');
      expect(fullOutput).toContain('Solana');

      logSpy.mockRestore();
    });

    it('should show info message when no addresses found', async () => {
      mockGetAccount.mockResolvedValue({ success: true, data: {} });

      const { depositCommand } = await import('../../src/commands/deposit.js');
      const output: string[] = [];
      const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
        output.push(args.join(' '));
      });

      await depositCommand.commands.find((c) => c.name() === 'spot')!.parseAsync([], { from: 'user' });
      const fullOutput = output.join('\n');

      expect(fullOutput).toContain('No deposit addresses found');
      logSpy.mockRestore();
    });

    it('should handle API error gracefully', async () => {
      mockGetAccount.mockResolvedValue({
        success: false,
        error: { code: 500, message: 'Server error' },
      });

      const { depositCommand } = await import('../../src/commands/deposit.js');
      const output: string[] = [];
      const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
        output.push(args.join(' '));
      });

      await depositCommand.commands.find((c) => c.name() === 'spot')!.parseAsync([], { from: 'user' });
      const fullOutput = output.join('\n');

      expect(fullOutput).toContain('Could not fetch deposit addresses');
      logSpy.mockRestore();
    });
  });

  describe('deposit perps — show addresses', () => {
    it('should display perps EVM deposit address when user selects "address"', async () => {
      mockSelect.mockResolvedValueOnce('address' as never);
      mockGetCurrentUser.mockResolvedValue({
        success: true,
        data: {
          id: '1',
          wallets: {
            'perpetual-evm': '0xc49228eb6e6a5967740e06379317040a38b5d860',
          },
        },
      });

      const { depositCommand } = await import('../../src/commands/deposit.js');
      const output: string[] = [];
      const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
        output.push(args.join(' '));
      });

      await depositCommand.commands.find((c) => c.name() === 'perps')!.parseAsync([], { from: 'user' });
      const fullOutput = output.join('\n');

      expect(fullOutput).toContain('Perps Deposit Address');
      expect(fullOutput).toContain('0xc49228eb6e6a5967740e06379317040a38b5d860');
      expect(fullOutput).toContain('Arbitrum');
      logSpy.mockRestore();
    });

    it('should show info when no perps address found', async () => {
      mockSelect.mockResolvedValueOnce('address' as never);
      mockGetCurrentUser.mockResolvedValue({
        success: true,
        data: { id: '1', wallets: {} },
      });

      const { depositCommand } = await import('../../src/commands/deposit.js');
      const output: string[] = [];
      const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
        output.push(args.join(' '));
      });

      await depositCommand.commands.find((c) => c.name() === 'perps')!.parseAsync([], { from: 'user' });
      const fullOutput = output.join('\n');

      expect(fullOutput).toContain('No perps deposit address found');
      logSpy.mockRestore();
    });
  });

  describe('deposit perps — transfer from spot', () => {
    it('should transfer USDC from spot to perps', async () => {
      mockSelect.mockResolvedValueOnce('transfer' as never);
      mockNumber.mockResolvedValueOnce(10 as never);
      mockConfirm.mockResolvedValueOnce(true as never);
      mockPerpsDeposit.mockResolvedValue({ success: true, data: { txHash: '0xabc' } });

      const { depositCommand } = await import('../../src/commands/deposit.js');
      const output: string[] = [];
      const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
        output.push(args.join(' '));
      });

      await depositCommand.commands.find((c) => c.name() === 'perps')!.parseAsync([], { from: 'user' });
      const fullOutput = output.join('\n');

      expect(fullOutput).toContain('Spot wallet');
      expect(fullOutput).toContain('Perps wallet');
      expect(mockPerpsDeposit).toHaveBeenCalledWith('test-token', { usdcAmount: 10 });
      logSpy.mockRestore();
    });

    it('should reject amounts below minimum', async () => {
      mockSelect.mockResolvedValueOnce('transfer' as never);
      mockNumber.mockResolvedValueOnce(2 as never);

      const { depositCommand } = await import('../../src/commands/deposit.js');
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

      await expect(
        depositCommand.commands.find((c) => c.name() === 'perps')!.parseAsync([], { from: 'user' }),
      ).rejects.toThrow('exit');

      expect(exitSpy).toHaveBeenCalledWith(1);
      errSpy.mockRestore();
      logSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });
});
