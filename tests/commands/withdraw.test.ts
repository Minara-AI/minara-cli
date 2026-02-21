/**
 * Integration tests for the withdraw command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config.js', () => ({
  requireAuth: vi.fn(),
  loadConfig: () => ({ baseUrl: 'https://api.minara.ai', confirmBeforeTransaction: false }),
}));

vi.mock('../../src/api/crosschain.js', () => ({
  transfer: vi.fn(),
  getAssets: vi.fn(),
}));

vi.mock('../../src/touchid.js', () => ({
  requireTouchId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  input: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('ora', () => ({
  default: () => ({ start: () => ({ stop: () => {}, text: '' }) }),
}));

vi.mock('../../src/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils.js')>();
  return {
    ...actual,
    lookupToken: vi.fn(),
    requireTransactionConfirmation: vi.fn().mockResolvedValue(undefined),
  };
});

import { requireAuth } from '../../src/config.js';
import { transfer, getAssets } from '../../src/api/crosschain.js';
import { select, input, confirm } from '@inquirer/prompts';
import { lookupToken } from '../../src/utils.js';

const mockRequireAuth = vi.mocked(requireAuth);
const mockTransfer = vi.mocked(transfer);
const mockGetAssets = vi.mocked(getAssets);
const mockSelect = vi.mocked(select);
const mockInput = vi.mocked(input);
const mockConfirm = vi.mocked(confirm);
const mockLookupToken = vi.mocked(lookupToken);

beforeEach(() => {
  vi.clearAllMocks();

  mockRequireAuth.mockReturnValue({
    accessToken: 'test-token',
    email: 'user@test.com',
  });

  mockGetAssets.mockResolvedValue({
    success: true,
    data: [
      { symbol: 'SOL', balance: '10.5', chain: 'solana' },
      { symbol: 'USDC', balance: '1000', chain: 'ethereum' },
    ],
  });

  mockLookupToken.mockResolvedValue({
    symbol: 'SOL', name: 'Solana', address: '0xTokenAddr', chain: 'sol',
  });
});

describe('withdraw command', () => {
  it('should call requireAuth first', async () => {
    mockSelect.mockResolvedValueOnce('solana');
    mockInput
      .mockResolvedValueOnce('0xToken')
      .mockResolvedValueOnce('1.5')
      .mockResolvedValueOnce('0xExternalWallet');
    mockConfirm.mockResolvedValueOnce(false);

    const { withdrawCommand } = await import('../../src/commands/withdraw.js');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await withdrawCommand.parseAsync([], { from: 'user' });

    expect(mockRequireAuth).toHaveBeenCalledOnce();
    logSpy.mockRestore();
  });

  it('should display current assets before prompting', async () => {
    mockSelect.mockResolvedValueOnce('solana');
    mockInput
      .mockResolvedValueOnce('0xToken')
      .mockResolvedValueOnce('5')
      .mockResolvedValueOnce('0xDest');
    mockConfirm.mockResolvedValueOnce(false);

    const { withdrawCommand } = await import('../../src/commands/withdraw.js');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await withdrawCommand.parseAsync([], { from: 'user' });

    expect(mockGetAssets).toHaveBeenCalledWith('test-token');
    logSpy.mockRestore();
  });

  it('should cancel withdrawal when user declines confirmation', async () => {
    mockSelect.mockResolvedValueOnce('ethereum');
    mockInput
      .mockResolvedValueOnce('0xUSDC')
      .mockResolvedValueOnce('100')
      .mockResolvedValueOnce('0xRecipient');
    mockConfirm.mockResolvedValueOnce(false);

    const { withdrawCommand } = await import('../../src/commands/withdraw.js');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await withdrawCommand.parseAsync([], { from: 'user' });

    expect(mockTransfer).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('should call transfer API when user confirms', async () => {
    mockSelect.mockResolvedValueOnce('solana');
    mockInput
      .mockResolvedValueOnce('0xTokenAddr')
      .mockResolvedValueOnce('2.5')
      .mockResolvedValueOnce('0xDestAddr');
    mockLookupToken.mockResolvedValueOnce({
      symbol: 'SOL', name: 'Solana', address: '0xTokenAddr', chain: 'sol',
    });
    mockConfirm.mockResolvedValueOnce(true);
    mockTransfer.mockResolvedValue({ success: true, data: { txId: 'tx123' } });

    const { withdrawCommand } = await import('../../src/commands/withdraw.js');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await withdrawCommand.parseAsync([], { from: 'user' });

    expect(mockTransfer).toHaveBeenCalledWith('test-token', {
      chain: 'solana',
      tokenAddress: '0xTokenAddr',
      tokenAmount: '2.5',
      recipient: '0xDestAddr',
    });
    logSpy.mockRestore();
  });

  it('should accept CLI options and skip prompts (with --yes)', async () => {
    mockLookupToken.mockResolvedValueOnce({
      symbol: 'USDC', name: 'USDC', address: '0xUSDC', chain: 'ethereum',
    });
    mockTransfer.mockResolvedValue({ success: true, data: { txId: 'tx456' } });

    const { withdrawCommand } = await import('../../src/commands/withdraw.js');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await withdrawCommand.parseAsync([
      '-c', 'ethereum',
      '-t', '0xUSDC',
      '-a', '50',
      '--to', '0xMyWallet',
      '-y',
    ], { from: 'user' });

    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();

    expect(mockTransfer).toHaveBeenCalledWith('test-token', {
      chain: 'ethereum',
      tokenAddress: '0xUSDC',
      tokenAmount: '50',
      recipient: '0xMyWallet',
    });

    logSpy.mockRestore();
  });

  it('should handle transfer API failure', async () => {
    mockSelect.mockResolvedValueOnce('base');
    mockInput
      .mockResolvedValueOnce('0xTok')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('0xDest');
    mockConfirm.mockResolvedValueOnce(true);
    mockTransfer.mockResolvedValue({
      success: false,
      error: { code: 400, message: 'Insufficient balance' },
    });

    const { withdrawCommand } = await import('../../src/commands/withdraw.js');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      withdrawCommand.parseAsync([], { from: 'user' }),
    ).rejects.toThrow('exit');

    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
