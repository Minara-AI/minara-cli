/**
 * Unit tests for src/utils.ts
 *
 * Tests formatting helpers (without chalk color codes).
 */
import { describe, it, expect } from 'vitest';
import { truncate, formatOrderSide, formatOrderStatus, normalizeChain } from '../src/utils.js';

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
});
