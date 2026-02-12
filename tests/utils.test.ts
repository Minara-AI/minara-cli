/**
 * Unit tests for src/utils.ts
 *
 * Tests formatting helpers (without chalk color codes).
 */
import { describe, it, expect } from 'vitest';
import { truncate, formatOrderSide, formatOrderStatus } from '../src/utils.js';

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
});
