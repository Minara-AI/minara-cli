/**
 * Integration tests for the transfer command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config.js', () => ({
  requireAuth: vi.fn(),
  loadConfig: () => ({ baseUrl: 'https://api.minara.ai', confirmBeforeTransaction: false }),
}));

vi.mock('../../src/api/crosschain.js', () => ({
  transfer: vi.fn(),
}));

vi.mock('../../src/touchid.js', () => ({
  requireTouchId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  input: vi.fn(),
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
import { transfer } from '../../src/api/crosschain.js';
import { select, input } from '@inquirer/prompts';
import { lookupToken } from '../../src/utils.js';

const mockRequireAuth = vi.mocked(requireAuth);
const mockTransfer = vi.mocked(transfer);
const mockSelect = vi.mocked(select);
const mockInput = vi.mocked(input);
const mockLookupToken = vi.mocked(lookupToken);

beforeEach(() => {
  vi.clearAllMocks();

  mockRequireAuth.mockReturnValue({
    accessToken: 'test-token',
    email: 'user@test.com',
  });

  mockLookupToken.mockResolvedValue({
    symbol: 'ETH', name: 'Ethereum', address: '0xEthAddr', chain: 'ethereum',
  });
});

describe('transfer / send command', () => {
  it('should have "send" registered as alias', async () => {
    const { transferCommand } = await import('../../src/commands/transfer.js');
    expect(transferCommand.name()).toBe('transfer');
    expect(transferCommand.aliases()).toContain('send');
  });

  it('should call requireAuth first', async () => {
    mockSelect.mockResolvedValueOnce('ethereum');
    mockInput
      .mockResolvedValueOnce('0xToken')
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce('0xRecipient');
    mockTransfer.mockResolvedValue({ success: true, data: { txId: 'tx1' } });

    const { transferCommand } = await import('../../src/commands/transfer.js');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await transferCommand.parseAsync([], { from: 'user' });

    expect(mockRequireAuth).toHaveBeenCalledOnce();
    logSpy.mockRestore();
  });

  it('should call transfer API with correct params', async () => {
    mockSelect.mockResolvedValueOnce('ethereum');
    mockInput
      .mockResolvedValueOnce('$ETH')
      .mockResolvedValueOnce('0.5')
      .mockResolvedValueOnce('0xDestAddr');
    mockLookupToken.mockResolvedValueOnce({
      symbol: 'ETH', name: 'Ethereum', address: '0xEthAddr', chain: 'ethereum',
    });
    mockTransfer.mockResolvedValue({ success: true, data: { txId: 'tx2' } });

    const { transferCommand } = await import('../../src/commands/transfer.js');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await transferCommand.parseAsync([], { from: 'user' });

    expect(mockTransfer).toHaveBeenCalledWith('test-token', {
      chain: 'ethereum',
      tokenAddress: '0xEthAddr',
      tokenAmount: '0.5',
      recipient: '0xDestAddr',
    });
    logSpy.mockRestore();
  });

  it('should accept CLI options and skip prompts (with --yes)', async () => {
    mockLookupToken.mockResolvedValueOnce({
      symbol: 'USDC', name: 'USDC', address: '0xUSDC', chain: 'base',
    });
    mockTransfer.mockResolvedValue({ success: true, data: { txId: 'tx3' } });

    const { transferCommand } = await import('../../src/commands/transfer.js');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await transferCommand.parseAsync([
      '-c', 'base',
      '-t', '$USDC',
      '-a', '200',
      '--to', '0xFriend',
      '-y',
    ], { from: 'user' });

    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockTransfer).toHaveBeenCalledWith('test-token', {
      chain: 'base',
      tokenAddress: '0xUSDC',
      tokenAmount: '200',
      recipient: '0xFriend',
    });
    logSpy.mockRestore();
  });
});
