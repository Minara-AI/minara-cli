/**
 * Unit tests for src/utils.ts
 *
 * Tests formatting helpers (without chalk color codes).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ora', () => ({
  default: (opts: { text: string }) => ({
    start: () => ({ stop: vi.fn(), text: opts.text, succeed: vi.fn(), fail: vi.fn() }),
  }),
}));

vi.mock('../src/api/tokens.js', () => ({
  searchTokens: vi.fn(),
}));

import {
  truncate,
  formatOrderSide,
  formatOrderStatus,
  normalizeChain,
  success,
  info,
  warn,
  error,
  spinner,
  formatAmount,
  unwrapApi,
  assertApiOk,
  wrapAction,
  lookupToken,
  formatTokenLabel,
  validateAddress,
} from '../src/utils.js';
import { searchTokens } from '../src/api/tokens.js';

const mockSearchTokens = vi.mocked(searchTokens);

describe('utils', () => {
  describe('truncate', () => {
    it('should return short strings unchanged', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('should truncate long strings with ellipsis', () => {
      const result = truncate('this is a very long string', 10);
      expect(result).toHaveLength(10);
      expect(result.endsWith('…')).toBe(true);
    });

    it('should handle exact-length strings', () => {
      expect(truncate('12345', 5)).toBe('12345');
    });
  });

  describe('formatOrderSide', () => {
    it('should return string for buy side', () => {
      const result = formatOrderSide('buy');
      expect(result).toContain('BUY');
    });

    it('should return string for sell side', () => {
      const result = formatOrderSide('sell');
      expect(result).toContain('SELL');
    });
  });

  describe('formatOrderStatus', () => {
    it('should format known statuses', () => {
      expect(formatOrderStatus('open')).toContain('open');
      expect(formatOrderStatus('filled')).toContain('filled');
      expect(formatOrderStatus('cancelled')).toContain('cancelled');
    });

    it('should return unknown statuses as-is', () => {
      expect(formatOrderStatus('custom')).toBe('custom');
    });
  });

  describe('normalizeChain', () => {
    it('should return supported chain names as-is', () => {
      expect(normalizeChain('solana')).toBe('solana');
      expect(normalizeChain('ethereum')).toBe('ethereum');
      expect(normalizeChain('base')).toBe('base');
    });

    it('should map short aliases to full chain names', () => {
      expect(normalizeChain('sol')).toBe('solana');
      expect(normalizeChain('eth')).toBe('ethereum');
      expect(normalizeChain('arb')).toBe('arbitrum');
      expect(normalizeChain('op')).toBe('optimism');
      expect(normalizeChain('avax')).toBe('avalanche');
      expect(normalizeChain('bnb')).toBe('bsc');
    });

    it('should map numeric chain IDs', () => {
      expect(normalizeChain('101')).toBe('solana');
      expect(normalizeChain('1')).toBe('ethereum');
      expect(normalizeChain('8453')).toBe('base');
      expect(normalizeChain('42161')).toBe('arbitrum');
      expect(normalizeChain('56')).toBe('bsc');
      expect(normalizeChain('137')).toBe('polygon');
    });

    it('should be case-insensitive', () => {
      expect(normalizeChain('SOLANA')).toBe('solana');
      expect(normalizeChain('Sol')).toBe('solana');
      expect(normalizeChain('ETH')).toBe('ethereum');
    });

    it('should return undefined for unknown chains', () => {
      expect(normalizeChain('unknown-chain')).toBeUndefined();
      expect(normalizeChain(undefined)).toBeUndefined();
    });
  });

  describe('success', () => {
    it('should log to console with message', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      success('Done!');
      expect(logSpy).toHaveBeenCalledWith(expect.anything(), 'Done!');
      logSpy.mockRestore();
    });
  });

  describe('info', () => {
    it('should log to console with message', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      info('Fetching data…');
      expect(logSpy).toHaveBeenCalledWith(expect.anything(), 'Fetching data…');
      logSpy.mockRestore();
    });
  });

  describe('warn', () => {
    it('should log to console with message', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      warn('No results found');
      expect(logSpy).toHaveBeenCalledWith(expect.anything(), 'No results found');
      logSpy.mockRestore();
    });
  });

  describe('error', () => {
    it('should log to console.error with message', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      error('Something went wrong');
      expect(errSpy).toHaveBeenCalledWith(expect.anything(), 'Something went wrong');
      errSpy.mockRestore();
    });
  });

  describe('spinner', () => {
    it('should return an ora spinner with given text', () => {
      const s = spinner('Loading…');
      expect(s).toBeDefined();
      expect(s.stop).toBeDefined();
      expect(typeof s.stop).toBe('function');
      s.stop();
    });
  });

  describe('formatAmount', () => {
    it('should format amount with currency', () => {
      const result = formatAmount('1,234.56', 'USD');
      expect(result).toContain('1,234.56');
      expect(result).toContain('USD');
    });

    it('should handle different currencies', () => {
      const result = formatAmount('100', 'SOL');
      expect(result).toContain('100');
      expect(result).toContain('SOL');
    });
  });

  describe('unwrapApi', () => {
    it('should return data on success', () => {
      const res = { success: true, data: { id: 42 } };
      expect(unwrapApi(res, 'fallback')).toEqual({ id: 42 });
    });

    it('should call error and process.exit(1) on failure', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as typeof process.exit);
      unwrapApi({ success: false, error: { message: 'API error' } }, 'Fallback msg');
      expect(errSpy).toHaveBeenCalledWith(expect.anything(), 'API error');
      expect(exitSpy).toHaveBeenCalledWith(1);
      errSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('should use fallback message when error message is missing', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as typeof process.exit);
      unwrapApi({ success: false }, 'Fallback msg');
      expect(errSpy).toHaveBeenCalledWith(expect.anything(), 'Fallback msg');
      errSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });

  describe('assertApiOk', () => {
    it('should do nothing on success', () => {
      assertApiOk({ success: true }, 'fallback');
    });

    it('should call error and process.exit(1) on failure', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as typeof process.exit);
      assertApiOk({ success: false, error: { message: 'Failed' } }, 'Fallback');
      expect(errSpy).toHaveBeenCalledWith(expect.anything(), 'Failed');
      expect(exitSpy).toHaveBeenCalledWith(1);
      errSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });

  describe('wrapAction', () => {
    it('should invoke the wrapped function and not exit on success', async () => {
      const fn = vi.fn().mockResolvedValue(undefined);
      const wrapped = wrapAction(fn);
      await wrapped();
      expect(fn).toHaveBeenCalledOnce();
    });

    it('should catch errors and call error + process.exit(1)', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as typeof process.exit);
      const fn = vi.fn().mockRejectedValue(new Error('Network failure'));
      const wrapped = wrapAction(fn);
      await wrapped();
      expect(errSpy).toHaveBeenCalledWith(expect.anything(), 'Network failure');
      expect(exitSpy).toHaveBeenCalledWith(1);
      errSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('should exit 130 for closed/aborted prompt errors', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as typeof process.exit);
      const fn = vi.fn().mockRejectedValue(new Error('Prompt closed'));
      const wrapped = wrapAction(fn);
      await wrapped();
      expect(exitSpy).toHaveBeenCalledWith(130);
      exitSpy.mockRestore();
    });
  });

  describe('lookupToken', () => {
    const mockSearchTokens = vi.mocked(searchTokens);

    beforeEach(() => {
      mockSearchTokens.mockReset();
    });

    it('should throw error when no results', async () => {
      mockSearchTokens.mockResolvedValue({ success: true, data: [] });
      await expect(lookupToken('0xunknown')).rejects.toThrow('Unknown token: 0xunknown');
    });

    it('should return token info for single exact match', async () => {
      mockSearchTokens.mockResolvedValue({
        success: true,
        data: [{ symbol: 'BONK', name: 'Bonk', address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', chain: 'solana' }],
      });
      const result = await lookupToken('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');
      expect(result).toEqual({
        symbol: 'BONK',
        name: 'Bonk',
        address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
        chain: 'solana',
      });
    });

    it('should throw error when API fails', async () => {
      mockSearchTokens.mockRejectedValue(new Error('Network error'));
      await expect(lookupToken('$BONK')).rejects.toThrow('Network error');
    });
  });

  describe('formatTokenLabel', () => {
    it('should format as "$TICKER — Name" when symbol and name present', () => {
      const result = formatTokenLabel({ symbol: 'BONK', name: 'Bonk', address: '0x123' });
      expect(result).toContain('$BONK');
      expect(result).toContain('Bonk');
      expect(result).toContain('—');
    });

    it('should return ticker only when name is missing', () => {
      const result = formatTokenLabel({ symbol: 'SOL', address: 'So11...' });
      expect(result).toContain('$SOL');
    });

    it('should return yellow address when symbol is missing', () => {
      const result = formatTokenLabel({ address: '0x1234567890123456789012345678901234567890' });
      expect(result).toContain('0x1234567890123456789012345678901234567890');
    });
  });

  describe('validateAddress', () => {
    it('should accept valid Solana address', () => {
      expect(validateAddress('So11111111111111111111111111111111111111112', 'solana')).toBe(true);
      expect(validateAddress('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 'sol')).toBe(true);
    });

    it('should reject invalid Solana address', () => {
      const msg = validateAddress('0x123', 'solana');
      expect(msg).toBe('Invalid Solana address (expected base58, 32–44 chars)');
    });

    it('should accept valid EVM address', () => {
      expect(validateAddress('0x' + '1'.repeat(40), 'ethereum')).toBe(true);
      expect(validateAddress('0x742d35Cc6634C0532925a3b844Bc454e4438f44e', 'base')).toBe(true);
    });

    it('should reject invalid EVM address', () => {
      const msg = validateAddress('0x123', 'ethereum');
      expect(msg).toBe('Invalid EVM address (expected 0x + 40 hex chars)');
    });

    it('should accept either format for unknown chain', () => {
      expect(validateAddress('So11111111111111111111111111111111111111112', undefined)).toBe(true);
      expect(validateAddress('0x' + '1'.repeat(40), undefined)).toBe(true);
    });

    it('should reject invalid format for unknown chain', () => {
      const msg = validateAddress('not-an-address', undefined);
      expect(msg).toBe('Invalid address format');
    });

    it('should return error for empty address', () => {
      expect(validateAddress('', 'ethereum')).toBe('Address is required');
      expect(validateAddress('   ', 'solana')).toBe('Address is required');
    });
  });
});
