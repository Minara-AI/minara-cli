# CLAUDE.md

Node.js CLI for crypto trading & AI chat. TypeScript strict, ESM (`"type": "module"`), Commander.js, Vitest.

## Structure

- `src/api/` — one file per API domain, all return `ApiResponse<T>`
- `src/commands/` — one file per command group, export a `Command` instance
- `src/types.ts` — all interfaces, use `Record<string, unknown>` not `any`
- `src/utils.ts` — shared helpers (token lookup, chain normalization, logging)
- `src/formatters.ts` — table/KV/JSON output

## Command Pattern

```typescript
export const fooCommand = new Command('foo')
  .action(wrapAction(async (opts) => {
    const creds = requireAuth();
    // For fund operations: single confirmation, no duplicate confirm()
    if (!opts.yes) await requireTransactionConfirmation(desc, token, details);
    await requireTouchId();
  }));
```

## Display Rules

- **Addresses** — always show full address, never truncate; use `chalk.yellow()` for visibility
- **Ticker** — prefix with `$` when displaying (e.g. `$SOL`, `$BONK`); stored without `$` internally
- **Token label** — format as `$TICKER — Name` via `formatTokenLabel()`; show `(native token)` suffix for native tokens
- **Chain name** — capitalize via `displayChain()` (e.g. `solana` → `Solana`, `bsc` → `BSC`); never show raw numeric chain IDs (e.g. `101`, `8453`)
- **Currency** — format as `$X.XX` with `toLocaleString('en-US', { minimumFractionDigits: 2 })`

## Key Rules

- **ESM imports need `.js`** — `'./foo.js'` not `'./foo'`
- **Single confirmation** — never pair `confirm()` with `requireTransactionConfirmation()`; use only the latter
- **`portfolioCost` is cumulative** — do not use for unrealized PnL; only use API-provided `unrealizedPnl`
- **Hex address check before numeric** — `Number("0x...")` is valid JS; test hex regex first in formatters
- **Chain auto-detected** — `normalizeChain()` converts aliases/numeric IDs to full names; `lookupToken()` handles multi-chain disambiguation sorted by gas cost
- **Native tokens** — SOL, ETH etc. must resolve to canonical on-chain addresses via `resolveNativeAddress()`

## Testing

- Mock `@inquirer/prompts`, `ora`, API modules, `requireTransactionConfirmation`, `requireTouchId`
- Commander commands are singletons — call `vi.resetModules()` + dynamic `import()` between tests

## Git

- Conventional Commits (`feat:`, `fix:`, `chore:`)
- **`git commit` may fail** with `error: unknown option 'trailer'` due to old Git — use plumbing: `git write-tree` → `git commit-tree` → `git update-ref`
- npm publish requires OTP (`--otp=<code>`)
