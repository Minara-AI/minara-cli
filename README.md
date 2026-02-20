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

- **Multi-method Login** — Email verification code, Google OAuth, or Apple ID
- **Interactive AI Chat** — Python/Node.js-style REPL with streaming responses, or single-shot mode
- **Smart Token Input** — Enter `$BONK` (ticker), token name, or contract address; auto-lookup with disambiguation
- **Transaction Safety** — Mandatory second confirmation before all fund operations (configurable), plus optional Touch ID
- **Touch ID Protection** — Biometric fingerprint verification for all fund operations (macOS)
- **Deposit & Withdraw** — View deposit addresses across chains, withdraw to external wallets
- **Asset Management** — View wallet balances across all supported chains
- **Spot Trading** — Cross-chain token swaps with dry-run simulation
- **Perpetual Futures** — Deposit, withdraw, place/cancel orders, manage leverage (Hyperliquid)
- **Limit Orders** — Create, list, and cancel price-triggered orders
- **Copy Trading** — Follow wallet addresses with configurable bots
- **Market Discovery** — Trending tokens, Fear & Greed Index, Bitcoin metrics
- **Premium Subscription** — View plans, subscribe via Stripe or Crypto, buy credit packages
- **Rich CLI Output** — Formatted tables, colored values, and smart number display; use `--json` for raw JSON

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
# Login (interactive — choose email, Google, or Apple)
minara login

# Check your account
minara account

# View deposit addresses
minara deposit

# Chat with Minara AI (interactive REPL)
minara chat

# Or send a single question
minara chat "What's the best DeFi yield right now?"

# Swap tokens (accepts ticker or address)
minara swap -c solana -t '$BONK' -s buy -a 100

# View trending tokens
minara discover trending
```

## Commands

### Auth & Account

| Command          | Description                                 |
| ---------------- | ------------------------------------------- |
| `minara login`   | Login via email, Google, or Apple ID        |
| `minara logout`  | Logout and clear local credentials          |
| `minara account` | View your account info and wallet addresses |

```bash
minara login                  # Interactive method selection
minara login -e user@mail.com # Email verification code
minara login --google         # Google OAuth (opens browser)
minara login --apple          # Apple ID (opens browser)
```

### Wallet & Funds

| Command               | Description                                           |
| --------------------- | ----------------------------------------------------- |
| `minara assets`       | View wallet assets (interactive: spot / perps / both) |
| `minara assets spot`  | View spot wallet balances across all chains           |
| `minara assets perps` | View perps account balance and open positions         |
| `minara deposit`      | Show deposit addresses and supported networks         |
| `minara withdraw`     | Withdraw tokens to an external wallet                 |

```bash
minara assets                     # Interactive: Spot / Perps / Both
minara assets spot                # Spot wallet across all chains
minara assets perps               # Perps account balance + positions
minara deposit
minara withdraw -c solana -t '$SOL' -a 10 --to <address>
minara withdraw                   # Interactive mode (accepts ticker or address)
```

### Spot Trading

| Command           | Description                        |
| ----------------- | ---------------------------------- |
| `minara swap`     | Swap tokens (cross-chain)          |
| `minara transfer` | Transfer tokens to another address |

```bash
minara swap                        # Interactive
minara swap -c solana -s buy -t '$BONK' -a 100   # By ticker
minara swap -c solana -s buy -t <address> -a 100  # By contract address
minara swap --dry-run              # Simulate without executing
```

> **Token input:** All token fields (`-t`) accept a `$TICKER` (e.g. `$BONK`), a token name, or a contract address. When multiple tokens match, you'll be prompted to select the correct one with full contract addresses displayed.

### Perpetual Futures

| Command                     | Description                               |
| --------------------------- | ----------------------------------------- |
| `minara perps deposit`      | Deposit USDC to Hyperliquid perps account |
| `minara perps withdraw`     | Withdraw USDC from perps account          |
| `minara perps positions`    | View all open positions                   |
| `minara perps order`        | Place an order (interactive builder)      |
| `minara perps cancel`       | Cancel open orders                        |
| `minara perps leverage`     | Update leverage for a symbol              |
| `minara perps trades`       | View completed trade history              |
| `minara perps fund-records` | View fund deposit/withdrawal records      |

```bash
minara perps deposit -a 100        # Deposit 100 USDC to perps
minara perps withdraw -a 50        # Withdraw 50 USDC from perps
minara perps positions             # List current positions
minara perps order                 # Interactive: choose symbol, side, size, price
minara perps leverage              # Interactive: set leverage for a trading pair
```

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

### Copy Trading

| Command                         | Description                 |
| ------------------------------- | --------------------------- |
| `minara copy-trade create`      | Create a new copy-trade bot |
| `minara copy-trade list`        | List all copy-trade bots    |
| `minara copy-trade start <id>`  | Start a paused bot          |
| `minara copy-trade stop <id>`   | Pause a running bot         |
| `minara copy-trade delete <id>` | Delete a bot permanently    |

```bash
minara copy-trade create           # Interactive: target wallet, chain, amount, options
minara copy-trade list             # Show all bots with status
minara copy-trade start abc123     # Resume a paused bot
minara copy-trade stop abc123      # Pause a running bot
```

### AI Chat

| Command                          | Description                                    |
| -------------------------------- | ---------------------------------------------- |
| `minara chat`                    | Enter interactive REPL (Python/Node.js-style)  |
| `minara chat [message]`          | Send a single message and exit                 |
| `minara chat --list`             | List all your conversations                    |
| `minara chat --history <chatId>` | View messages in a conversation                |
| `minara chat -c <chatId>`       | Continue an existing conversation              |

```bash
minara chat                                    # Enter interactive REPL mode
minara chat "What is the current BTC price?"   # Single question, streamed answer
minara chat --thinking "Analyze ETH outlook"   # Enable reasoning mode
minara chat --deep-research "DeFi yield trends"# Deep research mode
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

| Command         | Description                                                             |
| --------------- | ----------------------------------------------------------------------- |
| `minara config` | View or update CLI settings (base URL, Touch ID, transaction confirm…) |

```bash
minara config                     # Interactive settings menu
```

Available settings:

| Setting                    | Default | Description                                           |
| -------------------------- | ------- | ----------------------------------------------------- |
| Base URL                   | —       | API endpoint                                          |
| Touch ID                   | Off     | Biometric verification for fund operations (macOS)    |
| Transaction Confirmation   | **On**  | Mandatory second confirmation before fund operations  |

### Transaction Safety

All fund-related operations go through a multi-layer safety flow:

```
1. First confirmation      (skippable with -y flag)
2. Transaction confirmation (mandatory — configurable in minara config)
3. Touch ID verification   (optional — macOS only)
4. Execute
```

The **transaction confirmation** shows the token ticker, name, full contract address, and operation details before asking for final approval:

```
⚠ Transaction confirmation
  Token    : $BONK — Bonk
  Address  : DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263
  Action   : BUY swap · 100 USD · solana
? Are you sure you want to proceed? (y/N)
```

This step is independent of the `-y` flag and Touch ID — it serves as an extra safety net. Disable it via `minara config` if not needed.

### Touch ID (macOS)

Minara CLI supports macOS Touch ID to protect all fund-related operations. When enabled, transfers, withdrawals, swaps, orders, and other financial actions require fingerprint verification before execution.

```bash
minara config                     # Select "Touch ID" to enable / disable
```

**Protected operations:** `withdraw`, `transfer`, `swap`, `perps deposit`, `perps withdraw`, `perps order`, `limit-order create`, `copy-trade create`

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
