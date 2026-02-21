// ═══════════════════════════════════════════════════════════════════════════
//  CLI-friendly data formatters
//
//  Replaces raw JSON.stringify output with tables and key-value displays.
// ═══════════════════════════════════════════════════════════════════════════

import chalk from 'chalk';
import Table from 'cli-table3';

// ─── Raw JSON mode ───────────────────────────────────────────────────────

let _rawJson = false;

/** Enable raw JSON output (all formatters fall back to JSON.stringify). */
export function setRawJson(enabled: boolean): void { _rawJson = enabled; }

/** Check if raw JSON output mode is active. */
export function isRawJson(): boolean { return _rawJson; }

// ─── Hidden keys (internal IDs, metadata noise) ─────────────────────────

/**
 * Keys matching this pattern are hidden from printKV / auto-detected table
 * columns. They are still included in --json raw output.
 */
const HIDDEN_KEYS = /^_?id$|^_id$|^__v$/i;

// ─── Per-context key exclusions (non-regex, for specific commands) ───────

/** Keys to skip from Fear & Greed display (redundant with pointDate). */
const FEAR_GREED_HIDDEN = new Set(['timestamp', 'price']);

// ─── Key / value helpers ─────────────────────────────────────────────────

/** Convert camelCase / snake_case key to "Title Case" label. */
export function formatLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')   // camelCase → camel Case
    .replace(/[_-]/g, ' ')                       // snake_case / kebab → spaces
    .replace(/\b\w/g, (c) => c.toUpperCase());   // Capitalise words
}

/** Smart-format a single value for terminal display. */
export function formatValue(value: unknown, key?: string): string {
  if (value === null || value === undefined || value === '') return chalk.dim('—');

  if (typeof value === 'boolean') return value ? chalk.green('Yes') : chalk.dim('No');

  if (typeof value === 'number') {
    // Percentage-like keys
    if (key && /percent|change|pnl|roi|rate/i.test(key)) {
      const sign = value >= 0 ? '+' : '';
      const color = value >= 0 ? chalk.green : chalk.red;
      return color(`${sign}${value.toLocaleString('en-US', { maximumFractionDigits: 4 })}%`);
    }
    // Price / USD-like keys
    if (key && /price|value|usd|amount|equity|margin|balance|fee|cost|cap/i.test(key)) {
      return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
    }
    // Unix timestamps – ms (13 digits ~2001–2100) or seconds (10 digits ~2001–2100)
    if (key && /timestamp|time|date|createdAt|updatedAt|expir/i.test(key)) {
      const ms = value > 1e12 ? value : value * 1000;
      if (ms > 946684800000 && ms < 4102444800000) {  // 2000-01-01 to 2100-01-01
        return new Date(ms).toLocaleString();
      }
    }
    return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
  }

  if (typeof value === 'string') {
    // Hex addresses — must check before numeric coercion (0x… is valid Number)
    if (/^0x[0-9a-fA-F]{20,}$/.test(value)) return chalk.yellow(value);
    // Numeric string that looks like a price / amount
    const num = Number(value);
    if (!isNaN(num) && value.trim() !== '') {
      return formatValue(num, key);
    }
    // Timestamps (ISO / unix seconds)
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return new Date(value).toLocaleString();
    }
    // URLs
    if (value.startsWith('http')) return chalk.cyan.underline(value);
    // Status-like
    if (/^(success|completed|filled|running|active)$/i.test(value)) return chalk.green(value);
    if (/^(failed|error|rejected|cancelled|canceled)$/i.test(value)) return chalk.red(value);
    if (/^(pending|open|processing|paused)$/i.test(value)) return chalk.yellow(value);
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return chalk.dim('—');
    if (value.every((v) => typeof v === 'string' || typeof v === 'number')) {
      return value.join(', ');
    }
    return chalk.dim(`[${value.length} items]`);
  }

  if (typeof value === 'object') {
    // Shallow nested — show as inline key=value
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== null && v !== undefined,
    );
    if (entries.length <= 3) {
      return entries.map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join('  ');
    }
    return chalk.dim(JSON.stringify(value));
  }

  return String(value);
}

// ─── printKV ─────────────────────────────────────────────────────────────

/**
 * Print an object as aligned key-value pairs.
 *
 * ```
 *   Transaction Id : 0x1234…abcd
 *   Status         : pending
 * ```
 */
export function printKV(data: Record<string, unknown> | object, indent = 2): void {
  if (_rawJson) { console.log(JSON.stringify(data, null, 2)); return; }

  const entries = Object.entries(data as Record<string, unknown>).filter(
    ([k, v]) => v !== undefined && v !== null && v !== '' && !HIDDEN_KEYS.test(k),
  );
  if (entries.length === 0) {
    console.log(chalk.dim(`${' '.repeat(indent)}No data.`));
    return;
  }

  const labels = entries.map(([k]) => formatLabel(k));
  const maxLen = Math.max(...labels.map((l) => l.length));
  const pad = ' '.repeat(indent);

  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i];
    const label = labels[i].padEnd(maxLen);
    console.log(`${pad}${chalk.dim(label)} : ${formatValue(value, key)}`);
  }
}

// ─── Column definition ───────────────────────────────────────────────────

export interface ColumnDef {
  /** Object key (supports nested: "a.b") */
  key: string;
  /** Column header label (defaults to formatLabel(key)) */
  label?: string;
  /** Custom formatter for cell value */
  format?: (value: unknown, row: Record<string, unknown>) => string;
  /** Max column width (content will be truncated) */
  maxWidth?: number;
}

// ─── printTable ──────────────────────────────────────────────────────────

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => {
    if (o && typeof o === 'object' && k in (o as Record<string, unknown>)) {
      return (o as Record<string, unknown>)[k];
    }
    return undefined;
  }, obj);
}

/**
 * Auto-detect columns from array data.
 * Picks keys that appear in most rows and are not deeply nested.
 */
function autoColumns(data: Record<string, unknown>[]): ColumnDef[] {
  const keyCounts = new Map<string, number>();
  for (const row of data) {
    for (const k of Object.keys(row)) {
      keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1);
    }
  }
  // Keep keys present in at least half the rows, exclude hidden keys & complex nested objects
  return [...keyCounts.entries()]
    .filter(([k, count]) => count >= data.length / 2 && !HIDDEN_KEYS.test(k))
    .filter(([k]) => {
      const sample = data.find((r) => r[k] !== undefined)?.[k];
      // Skip deeply nested objects / large arrays
      if (Array.isArray(sample) && sample.length > 3) return false;
      if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
        const keys = Object.keys(sample as Record<string, unknown>);
        return keys.length <= 3;
      }
      return true;
    })
    .map(([key]) => ({ key }));
}

/**
 * Print an array of objects as a CLI table.
 *
 * If `columns` is omitted, columns are auto-detected from the data.
 */
export function printTable(
  data: Record<string, unknown>[] | object[],
  columns?: ColumnDef[],
): void {
  if (_rawJson) { console.log(JSON.stringify(data, null, 2)); return; }

  if (!data || (Array.isArray(data) && data.length === 0)) {
    console.log(chalk.dim('  No data.'));
    return;
  }

  if (!Array.isArray(data)) {
    printKV(data as object);
    return;
  }

  const rows = data as Record<string, unknown>[];
  const cols = columns ?? autoColumns(rows);
  if (cols.length === 0) {
    // fallback — just printKV for each item
    for (const row of data) {
      printKV(row);
      console.log('');
    }
    return;
  }

  const table = new Table({
    head: cols.map((c) => chalk.white.bold(c.label ?? formatLabel(c.key))),
    style: { head: [], border: ['dim'] },
    wordWrap: true,
  });

  for (const row of rows) {
    table.push(
      cols.map((c) => {
        const raw = getNestedValue(row, c.key);
        if (c.format) return c.format(raw, row);
        const str = formatValue(raw, c.key);
        if (c.maxWidth && str.length > c.maxWidth) {
          return str.slice(0, c.maxWidth - 1) + '…';
        }
        return str;
      }),
    );
  }

  console.log(table.toString());
}

// ─── printTxResult ───────────────────────────────────────────────────────

/**
 * Pretty-print a transaction result (deposit, withdraw, swap, transfer, order, etc.)
 * Falls back silently if data is empty/undefined.
 */
export function printTxResult(data: unknown): void {
  if (!data) return;
  if (_rawJson) { console.log(JSON.stringify(data, null, 2)); return; }

  if (typeof data !== 'object') {
    console.log(chalk.dim(`  ${data}`));
    return;
  }

  const obj = data as Record<string, unknown>;
  console.log('');
  printKV(obj);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Pre-built column configs for known data types
// ═══════════════════════════════════════════════════════════════════════════

/** Spot wallet assets (WalletAsset[]) */
export const SPOT_COLUMNS: ColumnDef[] = [
  { key: 'tokenSymbol', label: 'Token', format: (v) => chalk.bold(String(v ?? '—')) },
  { key: 'chainId', label: 'Chain', format: (v) => {
    const s = String(v ?? '—');
    return chalk.cyan(s.charAt(0).toUpperCase() + s.slice(1));
  }},
  { key: 'balance', label: 'Balance' },
  { key: 'marketPrice', label: 'Price', format: (v) => v ? `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}` : chalk.dim('—') },
  { key: '_value', label: 'Value', format: (v) => {
    const n = Number(v ?? 0);
    return n > 0 ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : chalk.dim('—');
  }},
  { key: 'unrealizedPnl', label: 'PnL', format: (v) => {
    const n = Number(v ?? 0);
    if (n === 0) return chalk.dim('—');
    const color = n >= 0 ? chalk.green : chalk.red;
    return color(`${n >= 0 ? '+' : ''}$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  }},
];

/** Perps positions — API uses snake_case field names */
export const POSITION_COLUMNS: ColumnDef[] = [
  { key: 'symbol', label: 'Symbol', format: (v) => chalk.bold(String(v ?? '—')) },
  { key: 'side', label: 'Side', format: (v) => {
    const s = String(v ?? '').toLowerCase();
    return s === 'long' || s === 'buy' ? chalk.green.bold(String(v)) : chalk.red.bold(String(v));
  }},
  { key: 'size', label: 'Size' },
  { key: 'entryPrice', label: 'Entry', format: (v) => formatValue(v, 'price') },
  { key: 'positionValue', label: 'Value', format: (v) => formatValue(v, 'price') },
  { key: 'unrealizedPnl', label: 'PnL', format: (v) => {
    if (!v && v !== 0) return chalk.dim('—');
    const n = Number(v);
    const color = n >= 0 ? chalk.green : chalk.red;
    return color(`${n >= 0 ? '+' : ''}$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  }},
  { key: 'leverage', label: 'Lev', format: (v) => v ? `${v}x` : chalk.dim('—') },
  { key: 'marginUsed', label: 'Margin', format: (v) => formatValue(v, 'price') },
];

/** Limit orders (LimitOrderInfo[]) */
export const LIMIT_ORDER_COLUMNS: ColumnDef[] = [
  { key: 'id', label: 'ID', format: (v) => chalk.dim(truncate(String(v ?? ''), 12)) },
  { key: 'side', label: 'Side', format: (v) => {
    const s = String(v ?? '').toLowerCase();
    return s === 'buy' ? chalk.green.bold('BUY') : chalk.red.bold('SELL');
  }},
  { key: 'chain', label: 'Chain', format: (v) => chalk.cyan(String(v ?? '—')) },
  { key: 'targetTokenCA', label: 'Token', format: (v) => v ? chalk.yellow(truncate(String(v), 14)) : chalk.dim('—') },
  { key: 'priceCondition', label: 'Condition', format: (v, row) => `${v ?? '?'} $${row.targetPrice ?? '?'}` },
  { key: 'amount', label: 'Amount', format: (v) => v ? `$${v}` : chalk.dim('—') },
  { key: 'status', label: 'Status', format: (v) => formatValue(v, 'status') },
];


/** Format large numbers as $1.23B / $456.78M / $12.3K */
function compactUsd(v: unknown): string {
  if (!v && v !== 0) return chalk.dim('—');
  const n = Number(v);
  if (isNaN(n)) return chalk.dim('—');
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

/** Trending / search tokens (TokenInfo[]) */
export const TOKEN_COLUMNS: ColumnDef[] = [
  { key: 'symbol', label: 'Symbol', format: (v) => chalk.bold(String(v ?? '—')) },
  { key: 'chain', label: 'Chain', format: (v) => v ? chalk.cyan(String(v)) : chalk.dim('—') },
  { key: 'price', label: 'Price', format: (v) => formatValue(v, 'price') },
  { key: 'priceChange24H', label: '24h %', format: (v) => formatValue(v, 'change') },
  { key: 'volume24H', label: 'Volume 24h', format: compactUsd },
  { key: 'marketCap', label: 'Market Cap', format: compactUsd },
];

export const STOCK_COLUMNS: ColumnDef[] = [
  { key: 'symbol', label: 'Symbol', format: (v) => chalk.bold(String(v ?? '—')) },
  { key: 'name', label: 'Name' },
  { key: 'price', label: 'Price', format: (v) => formatValue(v, 'price') },
  { key: 'priceChange24H', label: '24h %', format: (v) => formatValue(v, 'change') },
  { key: 'volume24H', label: 'Volume 24h', format: compactUsd },
  { key: 'marketCap', label: 'Market Cap', format: compactUsd },
];

// ═══════════════════════════════════════════════════════════════════════════
//  Specialised display helpers for discover commands
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pretty-print Fear & Greed Index — hides redundant `timestamp` and `price`.
 */
export function printFearGreed(data: Record<string, unknown>): void {
  if (_rawJson) { console.log(JSON.stringify(data, null, 2)); return; }

  const entries = Object.entries(data).filter(
    ([k, v]) => v !== undefined && v !== null && v !== '' && !HIDDEN_KEYS.test(k) && !FEAR_GREED_HIDDEN.has(k),
  );
  if (entries.length === 0) { console.log(chalk.dim('  No data.')); return; }

  const labels = entries.map(([k]) => formatLabel(k));
  const maxLen = Math.max(...labels.map((l) => l.length));

  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i];
    const label = labels[i].padEnd(maxLen);
    console.log(`  ${chalk.dim(label)} : ${formatValue(value, key)}`);
  }
}

/**
 * Pretty-print BTC/crypto metrics — flatten currentQuote, skip ohlcvQuotes.
 */
export function printCryptoMetrics(data: Record<string, unknown>): void {
  if (_rawJson) { console.log(JSON.stringify(data, null, 2)); return; }

  const quote = data.currentQuote as Record<string, unknown> | undefined;
  const change24h = data.priceChange24h as number | undefined;

  // Build a flat display object from the quote
  const display: [string, string][] = [];

  if (quote) {
    if (quote.close !== undefined) display.push(['Current Price', formatValue(quote.close, 'price')]);
    if (quote.open !== undefined) display.push(['Open (24h)', formatValue(quote.open, 'price')]);
    if (quote.high !== undefined) display.push(['High (24h)', formatValue(quote.high, 'price')]);
    if (quote.low !== undefined) display.push(['Low (24h)', formatValue(quote.low, 'price')]);
    if (quote.high_timestamp) display.push(['High At', formatValue(quote.high_timestamp, 'timestamp')]);
    if (quote.low_timestamp) display.push(['Low At', formatValue(quote.low_timestamp, 'timestamp')]);
  }

  if (change24h !== undefined) {
    display.push(['Price Change 24h', formatValue(change24h, 'change')]);
  } else if (quote?.percent_change !== undefined) {
    display.push(['Price Change 24h', formatValue(quote.percent_change, 'change')]);
  }

  if (quote?.price_change !== undefined) {
    display.push(['Δ Price (USD)', formatValue(quote.price_change, 'price')]);
  }

  if (display.length === 0) {
    // fallback to generic printKV
    printKV(data);
    return;
  }

  const maxLen = Math.max(...display.map(([l]) => l.length));
  for (const [label, val] of display) {
    console.log(`  ${chalk.dim(label.padEnd(maxLen))} : ${val}`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}
