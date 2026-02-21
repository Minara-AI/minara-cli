/**
 * Integration tests for the swap command.
 *
 * The swap command now:
 * - Uses `swaps` (plural) API endpoint instead of `swap`
 * - Derives chain from token lookup (no chain selection)
 * - Supports "all" for sell amount
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config.js', () => ({
  requireAuth: vi.fn(),
  loadConfig: () => ({ baseUrl: 'https://api.minara.ai', confirmBeforeTransaction: false }),
}));

vi.mock('../../src/api/crosschain.js', () => ({
  swaps: vi.fn(),
  swapsSimulate: vi.fn(),
}));

vi.mock('../../src/api/client.js', () => ({
  get: vi.fn().mockResolvedValue({ success: true, data: [] }),
  post: vi.fn().mockResolvedValue({ success: true, data: {} }),
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
import { swaps } from '../../src/api/crosschain.js';
import { select, input, confirm } from '@inquirer/prompts';
import { lookupToken } from '../../src/utils.js';

const mockRequireAuth = vi.mocked(requireAuth);
const mockSwaps = vi.mocked(swaps);
const mockSelect = vi.mocked(select);
const mockInput = vi.mocked(input);
const mockConfirm = vi.mocked(confirm);
const mockLookupToken = vi.mocked(lookupToken);

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockReturnValue({ accessToken: 'swap-token' });
});

describe('swap command', () => {
  it('should require authentication', async () => {
    mockSelect.mockResolvedValueOnce('buy');
    mockInput.mockResolvedValueOnce('$SOL');
    mockLookupToken.mockResolvedValueOnce({
      symbol: 'SOL', name: 'Solana', address: 'So11111111111111111111111111111111111111112', chain: 'sol',
    });
    mockInput.mockResolvedValueOnce('100');
    mockConfirm.mockResolvedValueOnce(false);

    const { swapCommand } = await import('../../src/commands/swap.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await swapCommand.parseAsync([], { from: 'user' });

    expect(mockRequireAuth).toHaveBeenCalledOnce();
    expect(mockSwaps).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('should call swaps API when confirmed', async () => {
    mockSelect.mockResolvedValueOnce('sell');
    mockInput.mockResolvedValueOnce('0xABC');
    mockLookupToken.mockResolvedValueOnce({
      symbol: 'BONK', name: 'Bonk', address: '0xABC', chain: 'sol',
    });
    mockInput.mockResolvedValueOnce('50');
    mockConfirm.mockResolvedValueOnce(true);
    mockSwaps.mockResolvedValue({ success: true, data: [{ txId: 'swap1' }] });

    const { swapCommand } = await import('../../src/commands/swap.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await swapCommand.parseAsync([], { from: 'user' });

    expect(mockSwaps).toHaveBeenCalledWith('swap-token', [{
      chain: 'solana',
      side: 'sell',
      tokenAddress: '0xABC',
      buyUsdAmountOrSellTokenAmount: '50',
    }]);

    logSpy.mockRestore();
  });

  it('should derive chain from token lookup (no chain prompt)', async () => {
    mockSelect.mockResolvedValueOnce('buy');
    mockInput.mockResolvedValueOnce('$ETH');
    mockLookupToken.mockResolvedValueOnce({
      symbol: 'ETH', name: 'Ethereum', address: '0x0000000000000000000000000000000000000000', chain: 'base',
    });
    mockInput.mockResolvedValueOnce('200');
    mockConfirm.mockResolvedValueOnce(false);

    const { swapCommand } = await import('../../src/commands/swap.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await swapCommand.parseAsync([], { from: 'user' });

    expect(mockSelect).toHaveBeenCalledTimes(1);
    const selectCalls = mockSelect.mock.calls;
    expect(selectCalls[0][0]).toHaveProperty('message', 'Action:');

    logSpy.mockRestore();
  });
});
