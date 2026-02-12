/**
 * Integration tests for the swap command.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config.js', () => ({
  requireAuth: vi.fn(),
  loadConfig: () => ({ baseUrl: 'https://api.minara.ai' }),
}));

vi.mock('../../src/api/crosschain.js', () => ({
  swap: vi.fn(),
  swapsSimulate: vi.fn(),
}));

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  input: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('ora', () => ({
  default: () => ({ start: () => ({ stop: () => {}, text: '' }) }),
}));

import { requireAuth } from '../../src/config.js';
import { swap, swapsSimulate } from '../../src/api/crosschain.js';
import { select, input, confirm } from '@inquirer/prompts';

const mockRequireAuth = vi.mocked(requireAuth);
const mockSwap = vi.mocked(swap);
const mockSwapsSimulate = vi.mocked(swapsSimulate);
const mockSelect = vi.mocked(select);
const mockInput = vi.mocked(input);
const mockConfirm = vi.mocked(confirm);

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockReturnValue({ accessToken: 'swap-token' });
});

describe('swap command', () => {
  it('should require authentication', async () => {
    // Set up full interactive flow then cancel
    mockSelect
      .mockResolvedValueOnce('solana')   // chain
      .mockResolvedValueOnce('buy');     // side
    mockInput
      .mockResolvedValueOnce('0xToken')  // token address
      .mockResolvedValueOnce('100');     // amount
    mockConfirm.mockResolvedValueOnce(false); // cancel

    const { swapCommand } = await import('../../src/commands/swap.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await swapCommand.parseAsync([], { from: 'user' });

    expect(mockRequireAuth).toHaveBeenCalledOnce();
    expect(mockSwap).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('should call swap API when confirmed', async () => {
    mockSelect
      .mockResolvedValueOnce('ethereum')
      .mockResolvedValueOnce('sell');
    mockInput
      .mockResolvedValueOnce('0xABC')
      .mockResolvedValueOnce('50');
    mockConfirm.mockResolvedValueOnce(true);
    mockSwap.mockResolvedValue({ success: true, data: { txId: 'swap1' } });

    const { swapCommand } = await import('../../src/commands/swap.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await swapCommand.parseAsync([], { from: 'user' });

    expect(mockSwap).toHaveBeenCalledWith('swap-token', {
      chain: 'ethereum',
      side: 'sell',
      tokenAddress: '0xABC',
      buyUsdAmountOrSellTokenAmount: '50',
    });

    logSpy.mockRestore();
  });
});
