/**
 * Unit tests for src/formatters.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Define mocks inline so vi.mock factory (hoisted) can use them
vi.mock('chalk', () => {
  const passthrough = (x: unknown) => (typeof x === 'string' ? x : String(x));
  const chain = new Proxy(passthrough, { get: () => chain });
  return { default: chain };
});

const { mockTablePush, mockTableToString } = vi.hoisted(() => {
  const push = vi.fn();
  const toString = vi.fn().mockReturnValue('| col1 | col2 |\n| a | b |');
  return { mockTablePush: push, mockTableToString: toString };
});
vi.mock('cli-table3', () => ({
  default: class TableMock {
    push = mockTablePush;
    toString = () => mockTableToString();
  },
}));

import {
  setRawJson,
  isRawJson,
  formatLabel,
  formatValue,
  printKV,
  printTable,
  printTxResult,
  POSITION_COLUMNS,
  FILL_COLUMNS,
  SPOT_COLUMNS,
  TRADE_COLUMNS,
} from '../../src/formatters.js';

beforeEach(() => {
  vi.clearAllMocks();
  setRawJson(false);
  mockTableToString.mockReturnValue('| col1 | col2 |\n| a | b |');
});

describe('setRawJson / isRawJson', () => {
  it('isRawJson returns false by default', () => {
    expect(isRawJson()).toBe(false);
  });

  it('setRawJson(true) enables raw JSON mode', () => {
    setRawJson(true);
    expect(isRawJson()).toBe(true);
  });

  it('setRawJson(false) disables raw JSON mode', () => {
    setRawJson(true);
    setRawJson(false);
    expect(isRawJson()).toBe(false);
  });
});

describe('formatLabel', () => {
  it('converts camelCase to Title Case', () => {
    expect(formatLabel('transactionId')).toBe('Transaction Id');
    expect(formatLabel('marketPrice')).toBe('Market Price');
  });

  it('converts snake_case to Title Case', () => {
    expect(formatLabel('close_price')).toBe('Close Price');
    expect(formatLabel('open_price')).toBe('Open Price');
  });

  it('converts kebab-case to Title Case', () => {
    expect(formatLabel('price-change')).toBe('Price Change');
  });

  it('handles single words', () => {
    expect(formatLabel('status')).toBe('Status');
    expect(formatLabel('balance')).toBe('Balance');
  });

  it('handles mixed camelCase and underscores', () => {
    expect(formatLabel('unrealizedPnl')).toBe('Unrealized Pnl');
  });
});

describe('formatValue', () => {
  it('returns dim dash for null, undefined, empty string', () => {
    expect(formatValue(null)).toBe('—');
    expect(formatValue(undefined)).toBe('—');
    expect(formatValue('')).toBe('—');
  });

  it('formats booleans as Yes/No', () => {
    expect(formatValue(true)).toBe('Yes');
    expect(formatValue(false)).toBe('No');
  });

  it('formats percentage-like keys with % and sign', () => {
    expect(formatValue(5.5, 'percent')).toContain('%');
    expect(formatValue(5.5, 'percent')).toContain('+');
    expect(formatValue(-3.2, 'priceChange')).toContain('-');
    expect(formatValue(0, 'pnl')).toContain('+');
    expect(formatValue(10, 'roi')).toContain('%');
    expect(formatValue(-2, 'rate')).toContain('-');
  });

  it('formats price/amount/value keys with $ and locale', () => {
    expect(formatValue(1234.56, 'price')).toBe('$1,234.56');
    expect(formatValue(100, 'value')).toBe('$100.00');
    expect(formatValue(50.123456, 'amount')).toBe('$50.123456');
    expect(formatValue(0.5, 'balance')).toBe('$0.50');
    expect(formatValue(10, 'fee')).toBe('$10.00');
    expect(formatValue(999, 'equity')).toContain('$');
    expect(formatValue(500, 'margin')).toContain('$');
    expect(formatValue(0.001, 'cost')).toContain('$');
  });

  it('formats unix timestamps (seconds) as locale date', () => {
    const ts = 1700000000; // ~Nov 2023
    const result = formatValue(ts, 'timestamp');
    expect(result).toMatch(/\d/);
    expect(result).not.toMatch(/^\d{10}$/);
  });

  it('formats unix timestamps (milliseconds) as locale date', () => {
    const ts = 1700000000000;
    const result = formatValue(ts, 'createdAt');
    expect(result).toMatch(/\d/);
  });

  it('formats plain numbers with locale', () => {
    expect(formatValue(12345)).toBe('12,345');
    expect(formatValue(12345.678)).toBe('12,345.678');
  });

  it('formats hex addresses with yellow (passthrough)', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678';
    expect(formatValue(addr)).toBe(addr);
  });

  it('formats short hex strings as numbers when they parse as valid hex', () => {
    expect(formatValue('0x1234')).toBe('4,660');
  });

  it('formats numeric strings via recursion', () => {
    expect(formatValue('100.50', 'price')).toBe('$100.50');
  });

  it('formats ISO date strings as locale date', () => {
    const iso = '2024-01-15T10:30:00.000Z';
    const result = formatValue(iso);
    expect(result).toMatch(/\d/);
    expect(result).not.toBe(iso);
  });

  it('formats URLs with cyan underline (passthrough)', () => {
    expect(formatValue('https://example.com')).toBe('https://example.com');
  });

  it('formats success status strings', () => {
    expect(formatValue('success')).toBe('success');
    expect(formatValue('completed')).toBe('completed');
    expect(formatValue('filled')).toBe('filled');
    expect(formatValue('running')).toBe('running');
    expect(formatValue('active')).toBe('active');
  });

  it('formats failed status strings', () => {
    expect(formatValue('failed')).toBe('failed');
    expect(formatValue('error')).toBe('error');
    expect(formatValue('rejected')).toBe('rejected');
    expect(formatValue('cancelled')).toBe('cancelled');
    expect(formatValue('canceled')).toBe('canceled');
  });

  it('formats pending status strings', () => {
    expect(formatValue('pending')).toBe('pending');
    expect(formatValue('open')).toBe('open');
    expect(formatValue('processing')).toBe('processing');
    expect(formatValue('paused')).toBe('paused');
  });

  it('formats empty array as dim dash', () => {
    expect(formatValue([])).toBe('—');
  });

  it('formats simple arrays as comma-joined', () => {
    expect(formatValue(['a', 'b', 'c'])).toBe('a, b, c');
    expect(formatValue([1, 2, 3])).toBe('1, 2, 3');
  });

  it('formats complex arrays as item count', () => {
    expect(formatValue([{ x: 1 }, { y: 2 }])).toBe('[2 items]');
  });

  it('formats shallow objects with ≤3 entries inline', () => {
    expect(formatValue({ a: 1, b: 2 })).toContain('a=');
    expect(formatValue({ a: 1, b: 2 })).toContain('b=');
  });

  it('formats deep objects as JSON string', () => {
    const obj = { a: 1, b: 2, c: 3, d: 4 };
    const result = formatValue(obj);
    expect(result).toContain('{');
    expect(result).toContain('}');
  });
});

describe('printKV', () => {
  it('prints key-value pairs with aligned labels', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printKV({ status: 'ok', amount: 100 });
    expect(logSpy).toHaveBeenCalled();
    const calls = logSpy.mock.calls.flat().join('\n');
    expect(calls).toContain('Status');
    expect(calls).toContain('ok');
    expect(calls).toContain('Amount');
    expect(calls).toContain('$100.00');
    logSpy.mockRestore();
  });

  it('filters out HIDDEN_KEYS (_id, __v, id)', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printKV({ _id: 'x', __v: 0, id: 123, name: 'foo' });
    const calls = logSpy.mock.calls.flat().join('\n');
    expect(calls).not.toContain('_id');
    expect(calls).not.toContain('__v');
    expect(calls).not.toContain('123');
    expect(calls).toContain('Name');
    expect(calls).toContain('foo');
    logSpy.mockRestore();
  });

  it('filters out undefined, null, empty string values', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printKV({ a: 'keep', b: undefined, c: null, d: '' });
    const calls = logSpy.mock.calls.flat().join('\n');
    expect(calls).toContain('keep');
    expect(calls).not.toContain('undefined');
    logSpy.mockRestore();
  });

  it('prints "No data." when no visible entries', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printKV({ _id: 'x', __v: 0 });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No data.'));
    logSpy.mockRestore();
  });

  it('uses custom indent', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printKV({ x: 1 }, 4);
    expect(logSpy.mock.calls[0][0]).toMatch(/^    /);
    logSpy.mockRestore();
  });

  it('outputs raw JSON when setRawJson(true)', () => {
    setRawJson(true);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printKV({ a: 1, b: 2 });
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ a: 1, b: 2 }, null, 2));
    logSpy.mockRestore();
  });
});

describe('printTable', () => {
  it('prints table via cli-table3 with columns', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printTable(
      [{ symbol: 'ETH', side: 'long' }],
      [{ key: 'symbol', label: 'Symbol' }, { key: 'side', label: 'Side' }],
    );
    expect(mockTablePush).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('| col1 | col2 |\n| a | b |');
    logSpy.mockRestore();
  });

  it('prints "No data." for empty array', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printTable([]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No data.'));
    logSpy.mockRestore();
  });

  it('falls back to printKV for non-array object', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printTable({ a: 1 } as unknown as Record<string, unknown>[]);
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('outputs raw JSON when setRawJson(true)', () => {
    setRawJson(true);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printTable([{ a: 1 }]);
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify([{ a: 1 }], null, 2));
    logSpy.mockRestore();
  });

  it('auto-detects columns when columns omitted', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printTable([
      { sym: 'A', val: 1 },
      { sym: 'B', val: 2 },
      { sym: 'C', val: 3 },
    ]);
    expect(mockTablePush).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('uses nested key paths', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printTable(
      [{ meta: { name: 'x' } }],
      [{ key: 'meta.name', label: 'Name' }],
    );
    expect(mockTablePush).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(String)]),
    );
    logSpy.mockRestore();
  });
});

describe('printTxResult', () => {
  it('returns early for null/undefined', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printTxResult(null);
    printTxResult(undefined);
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('prints object via printKV', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const txHash = '0x1234567890abcdef1234567890abcdef12345678';
    printTxResult({ txHash, status: 'success' });
    expect(logSpy).toHaveBeenCalled();
    const joined = logSpy.mock.calls.flat().join('\n');
    expect(joined).toContain('Tx Hash');
    expect(joined).toContain(txHash);
    expect(joined).toContain('Status');
    expect(joined).toContain('success');
    logSpy.mockRestore();
  });

  it('prints scalar as dim text', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printTxResult('some message');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('some message'));
    logSpy.mockRestore();
  });

  it('outputs raw JSON when setRawJson(true)', () => {
    setRawJson(true);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printTxResult({ hash: '0x123' });
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ hash: '0x123' }, null, 2));
    logSpy.mockRestore();
  });
});

describe('Column definitions', () => {
  it('POSITION_COLUMNS has expected keys', () => {
    const keys = POSITION_COLUMNS.map((c) => c.key);
    expect(keys).toContain('symbol');
    expect(keys).toContain('side');
    expect(keys).toContain('size');
    expect(keys).toContain('entryPrice');
    expect(keys).toContain('positionValue');
    expect(keys).toContain('unrealizedPnl');
    expect(keys).toContain('leverage');
    expect(keys).toContain('marginUsed');
  });

  it('FILL_COLUMNS has expected keys', () => {
    const keys = FILL_COLUMNS.map((c) => c.key);
    expect(keys).toContain('coin');
    expect(keys).toContain('dir');
    expect(keys).toContain('sz');
    expect(keys).toContain('px');
    expect(keys).toContain('closedPnl');
    expect(keys).toContain('fee');
    expect(keys).toContain('time');
  });

  it('SPOT_COLUMNS has expected keys', () => {
    const keys = SPOT_COLUMNS.map((c) => c.key);
    expect(keys).toContain('tokenSymbol');
    expect(keys).toContain('chainId');
    expect(keys).toContain('balance');
    expect(keys).toContain('marketPrice');
    expect(keys).toContain('_value');
    expect(keys).toContain('unrealizedPnl');
  });

  it('TRADE_COLUMNS has expected keys', () => {
    const keys = TRADE_COLUMNS.map((c) => c.key);
    expect(keys).toContain('symbol');
    expect(keys).toContain('side');
    expect(keys).toContain('quantity');
    expect(keys).toContain('open_price');
    expect(keys).toContain('close_price');
    expect(keys).toContain('pnl');
    expect(keys).toContain('duration');
    expect(keys).toContain('close_time');
  });
});
