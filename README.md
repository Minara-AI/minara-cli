<p align="center">
  <h1 align="center">Minara CLI</h1>
  <p align="center">
    Your AI-powered digital finance assistant — from the terminal.
    <br />
    Trade, swap, chat, and manage your portfolio without leaving the command line.
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/minara"><img alt="npm version" src="https://img.shields.io/npm/v/minara?color=cb3837&label=npm"></a>
  <a href="https://github.com/user/minara-cli/blob/main/LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Node.js" src="https://img.shields.io/badge/node-%3E%3D18-brightgreen">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6">
</p>

---

## Features

- **AI Chat** — Crypto-native AI for on-chain analysis, market research, and DeFi due diligence. Interactive REPL & single-shot queries with `fast` / `quality` / `thinking` modes
- **Wallet & Balance** — Unified balance view, spot holdings with PnL, perps account overview, deposits, withdrawals, and credit card on-ramp via MoonPay
- **Chain-Abstracted Trading** — Cross-chain swaps with automatic chain detection, perpetual futures, and limit orders. Accepts `$TICKER`, token name, or contract address
- **AI Autopilot & Analysis** — Fully managed AI trading strategies for perps, plus on-demand long/short analysis with one-click quick order
- **Market Discovery** — Trending tokens & stocks, Fear & Greed Index, on-chain metrics, and search

## Installation

```bash
npm install -g minara
```

Or run without installing:

```bash
npx minara --help
```

**Requires Node.js >= 18**

## Quick Start

```bash
# Login (interactive — device code or email)
minara login

# Check your account
minara account

# View deposit addresses
minara deposit

# Chat with Minara AI (interactive REPL)
minara chat

# Or send a single question
minara chat "What's the best DeFi yield right now?"

# Swap tokens (chain auto-detected from token)
minara swap -t '$BONK' -s buy -a 100

# View trending tokens
minara discover trending
```

## Commands

### Auth & Account

| Command          | Description                                 |
| ---------------- | ------------------------------------------- |
| `minara login`   | Login via device code or email              |
| `minara logout`  | Logout and clear local credentials          |
| `minara account` | View your account info and wallet addresses |

```bash
minara login                  # Interactive: device code (default) or email
minara login --device         # Device code (opens browser to verify)
minara login -e user@mail.com # Email verification code
```

### Wallet & Funds

| Command               | Description                                                    |
| --------------------- | -------------------------------------------------------------- |
| `minara balance`      | Combined USDC/USDT balance across spot and perps               |
| `minara assets`       | Full overview: spot holdings + perps account                   |
| `minara assets spot`  | Spot wallet: portfolio value, cost, PnL, holdings              |
| `minara assets perps` | Perps account: equity, margin, positions                       |
| `minara deposit`      | Deposit to spot, perps, or buy crypto with credit card         |
| `minara deposit buy`  | Buy crypto with credit card via MoonPay                        |
| `minara withdraw`     | Withdraw tokens to an external wallet                          |

```bash
minara balance                    # Quick total: Spot + Perps available balance
minara assets                     # Full overview (spot + perps)
minara assets spot                # Spot wallet with PnL breakdown
minara assets perps               # Perps equity, margin, positions
minara deposit                    # Interactive: Spot / Perps / Buy with credit card
minara deposit spot               # Show spot wallet deposit addresses (EVM + Solana)
minara deposit perps              # Perps: show Arbitrum deposit address, or transfer from Spot → Perps
minara deposit buy                # Buy crypto with credit card via MoonPay (opens browser)
minara withdraw -c solana -t '$SOL' -a 10 --to <address>
minara withdraw                   # Interactive mode (accepts ticker or address)
```

### Spot Trading

| Command           | Description                        |
| ----------------- | ---------------------------------- |
| `minara swap`     | Swap tokens (chain auto-detected)  |
| `minara transfer` | Transfer tokens to another address |

```bash
minara swap                        # Interactive: side → token → amount
minara swap -s buy -t '$BONK' -a 100              # Buy by ticker (chain auto-detected)
minara swap -s sell -t '$NVDAx' -a all             # Sell entire balance
minara swap --dry-run              # Simulate without executing
```

> **Chain abstraction:** The chain is automatically detected from the token. If a token exists on multiple chains (e.g. USDC), you'll be prompted to pick one, sorted by gas cost (lowest first). Sell mode supports `all` to sell full balance, and caps amounts exceeding your balance.
>
> **Token input:** All token fields (`-t`) accept a `$TICKER` (e.g. `$BONK`), a token name, or a contract address.

### Perpetual Futures

| Command                     | Description                                           |
| --------------------------- | ----------------------------------------------------- |
| `minara perps positions`    | View all open positions with PnL                      |
| `minara perps order`        | Place an order (interactive builder)                  |
| `minara perps cancel`       | Cancel open orders                                    |
| `minara perps leverage`     | Update leverage for a symbol                          |
| `minara perps trades`       | View trade history (Hyperliquid fills)                |
| `minara perps deposit`      | Deposit USDC to perps (or use `minara deposit perps`) |
| `minara perps withdraw`     | Withdraw USDC from perps account                      |
| `minara perps fund-records` | View fund deposit/withdrawal records                  |
| `minara perps autopilot`    | Manage AI autopilot trading strategy (on/off/config)  |
| `minara perps ask`          | AI long/short analysis with quick order               |

```bash
minara perps positions             # List positions with equity, margin, PnL
minara perps order                 # Interactive: symbol selector → side → size → confirm
minara perps leverage              # Interactive: shows max leverage per asset
minara perps trades                # Recent fills from Hyperliquid (default 7 days)
minara perps trades -d 30          # Last 30 days of trade history
minara perps deposit -a 100        # Deposit 100 USDC to perps
minara perps withdraw -a 50        # Withdraw 50 USDC from perps
minara perps autopilot             # Toggle AI autopilot, create/update strategy
minara perps ask                   # AI analysis → optional quick order
```

> **Autopilot:** When autopilot is ON, manual order placement (`minara perps order`) is blocked to prevent conflicts with AI-managed trades. Turn off autopilot first via `minara perps autopilot`.
>
> **Ask AI → Quick Order:** After the AI analysis, you can instantly place a market order based on the recommended direction, entry price, and position size — no need to re-enter parameters.

### Limit Orders

| Command                          | Description                          |
| -------------------------------- | ------------------------------------ |
| `minara limit-order create`      | Create a price-triggered limit order |
| `minara limit-order list`        | List all your limit orders           |
| `minara limit-order cancel <id>` | Cancel a specific order by ID        |

```bash
minara limit-order create          # Interactive: token, price, side, amount, expiry
minara limit-order list            # Show all orders with status
minara limit-order cancel abc123   # Cancel order by ID
```

### AI Chat

| Command                          | Description                                   |
| -------------------------------- | --------------------------------------------- |
| `minara chat`                    | Enter interactive REPL (Python/Node.js-style) |
| `minara chat [message]`          | Send a single message and exit                |
| `minara chat --list`             | List all your conversations                   |
| `minara chat --history <chatId>` | View messages in a conversation               |
| `minara chat -c <chatId>`        | Continue an existing conversation             |

```bash
minara chat                                    # Enter interactive REPL mode
minara chat "What is the current BTC price?"   # Single question, streamed answer
minara chat --quality "Analyze ETH outlook"     # Quality mode (default: fast)
minara chat --thinking "Analyze ETH outlook"   # Enable reasoning mode
minara chat -c <chatId>                        # Continue a specific chat in REPL
minara chat --list                             # List past conversations
minara chat --history <chatId>                 # Replay a specific conversation
```

**Interactive REPL mode** — When launched without a message argument, the chat enters an interactive session:

```
Minara AI Chat session:a1b2c3d4
──────────────────────────────────────────────────
Type a message to chat. /help for commands, Ctrl+C to exit.

>>> What's the price of BTC?
Minara: Bitcoin is currently trading at $95,432...

>>> /help

  Commands:
  /new        Start a new conversation
  /continue   Continue an existing conversation
  /list       List all historical chats
  /id         Show current chat ID
  exit        Quit the chat
```

### Market Discovery

| Command                            | Description                              |
| ---------------------------------- | ---------------------------------------- |
| `minara discover trending`         | View currently trending tokens           |
| `minara discover search <keyword>` | Search for tokens or stocks by name      |
| `minara discover fear-greed`       | View the crypto Fear & Greed Index       |
| `minara discover btc-metrics`      | View Bitcoin on-chain and market metrics |

```bash
minara discover trending           # Top trending tokens right now
minara discover search SOL         # Search for tokens matching "SOL"
minara discover fear-greed         # Current market sentiment index
minara discover btc-metrics        # Bitcoin hashrate, supply, dominance, etc.
```

### Premium & Subscription

| Command                      | Description                                     |
| ---------------------------- | ----------------------------------------------- |
| `minara premium plans`       | View all subscription plans and credit packages |
| `minara premium status`      | View your current subscription status           |
| `minara premium subscribe`   | Subscribe or change plan (upgrade / downgrade)  |
| `minara premium buy-credits` | Buy a one-time credit package                   |
| `minara premium cancel`      | Cancel your current subscription                |

```bash
minara premium plans              # Compare Free, Lite, Starter, Pro, Partner plans
minara premium status             # Check your current plan and billing info
minara premium subscribe          # Interactive: select plan → Stripe or Crypto payment
minara premium buy-credits        # Buy additional credits (one-time purchase)
minara premium cancel             # Cancel subscription (keeps access until period ends)
```

### Output Format

By default, all commands display data using formatted tables, colored text, and human-friendly numbers (e.g. `$1.23M`, `+3.46%`). To get raw JSON output for scripting or piping, add the `--json` flag to any command:

```bash
minara discover trending --json    # Raw JSON array of trending tokens
minara discover btc-metrics --json # Full BTC metrics with OHLCV data
minara assets spot --json          # Raw JSON asset list
```

### Configuration

| Command         | Description                                                            |
| --------------- | ---------------------------------------------------------------------- |
| `minara config` | View or update CLI settings (base URL, Touch ID, transaction confirm…) |

```bash
minara config                     # Interactive settings menu
```

Available settings:

| Setting                  | Default | Description                                          |
| ------------------------ | ------- | ---------------------------------------------------- |
| Base URL                 | —       | API endpoint                                         |
| Touch ID                 | Off     | Biometric verification for fund operations (macOS)   |
| Transaction Confirmation | **On**  | Mandatory second confirmation before fund operations |

### Transaction Safety

All fund-related operations go through a multi-layer safety flow:

```
1. First confirmation      (skippable with -y flag)
2. Transaction confirmation (mandatory — configurable in minara config)
3. Touch ID verification   (optional — macOS only)
4. Execute
```

The **transaction confirmation** shows chain, token, address, side, amount, and operation details before asking for final approval:

```
⚠ Transaction confirmation
  Chain    : solana
  Token    : $BONK — Bonk
  Address  : DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263
  Side     : BUY
  Amount   : 100 USD
  Action   : BUY swap · 100 USD · solana
? Are you sure you want to proceed? (y/N)
```

This step is independent of the `-y` flag and Touch ID — it serves as an extra safety net. Disable it via `minara config` if not needed.

### Touch ID (macOS)

Minara CLI supports macOS Touch ID to protect all fund-related operations. When enabled, transfers, withdrawals, swaps, orders, and other financial actions require fingerprint verification before execution.

```bash
minara config                     # Select "Touch ID" to enable / disable
```

**Protected operations:** `withdraw`, `transfer`, `swap`, `deposit` (Spot→Perps transfer), `perps deposit`, `perps withdraw`, `perps order`, `limit-order create`

> **Note:** Touch ID requires macOS with Touch ID hardware. The `--yes` flag skips the initial confirmation prompt but does **not** bypass transaction confirmation or Touch ID.

## Supported Chains

Ethereum, Base, Arbitrum, Optimism, Polygon, Avalanche, Solana, BSC, Berachain, Blast, Manta, Mode, Sonic, and more.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Run locally
node dist/index.js --help

# Link globally for testing
npm link
minara --help
```

## Testing

Test suite built with [Vitest](https://vitest.dev/) — 119 tests covering unit, API, and command integration layers.

```bash
npm test                # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage report
```

## Security

- **Transaction Confirmation** — Mandatory second confirmation before all fund operations, showing full token details and contract addresses (default: enabled, configurable)
- **Touch ID** — Optional biometric protection for all fund operations (macOS only). A native Swift helper binary is compiled on first use and cached in `~/.minara/`
- **Token Verification** — Token ticker, name, and full contract address are always displayed before any transaction to prevent wrong-token mistakes
- Credentials are stored in `~/.minara/credentials.json` with `0600` file permissions
- The `~/.minara/` directory is created with `0700` permissions
- Tokens are never logged or printed to the console
- OAuth login uses a temporary local server that shuts down after the callback
- Non-TTY environments (CI/pipes) skip interactive prompts and return errors directly

## License

[MIT](LICENSE)
