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
- **Touch ID Protection** — Biometric fingerprint verification for all fund operations (macOS)
- **Deposit & Withdraw** — View deposit addresses across chains, withdraw to external wallets
- **Asset Management** — View wallet balances across all supported chains
- **AI Chat** — Stream conversations with Minara AI, with thinking and deep-research modes
- **Spot Trading** — Cross-chain token swaps with dry-run simulation
- **Perpetual Futures** — Deposit, withdraw, place/cancel orders, manage leverage (Hyperliquid)
- **Limit Orders** — Create, list, and cancel price-triggered orders
- **Copy Trading** — Follow wallet addresses with configurable bots
- **Market Discovery** — Trending tokens, Fear & Greed Index, Bitcoin metrics
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

# Chat with Minara AI
minara chat "What's the best DeFi yield right now?"

# Swap tokens
minara swap

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
minara withdraw -c solana -t <token> -a 10 --to <address>
minara withdraw                   # Interactive mode
```

### Spot Trading

| Command           | Description                        |
| ----------------- | ---------------------------------- |
| `minara swap`     | Swap tokens (cross-chain)          |
| `minara transfer` | Transfer tokens to another address |

```bash
minara swap                        # Interactive
minara swap -c solana -s buy -t <token> -a 100
minara swap --dry-run              # Simulate without executing
```

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

| Command                          | Description                                |
| -------------------------------- | ------------------------------------------ |
| `minara chat [message]`          | Send a message (or enter interactive mode) |
| `minara chat --list`             | List all your conversations                |
| `minara chat --history <chatId>` | View messages in a conversation            |

```bash
minara chat "What is the current BTC price?"   # Single question, streamed answer
minara chat                                    # Enter interactive REPL mode
minara chat --thinking "Analyze ETH outlook"   # Enable reasoning mode
minara chat --deep-research "DeFi yield trends"# Deep research mode
minara chat --list                             # List past conversations
minara chat --history <chatId>                 # Replay a specific conversation
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

### Output Format

By default, all commands display data using formatted tables, colored text, and human-friendly numbers (e.g. `$1.23M`, `+3.46%`). To get raw JSON output for scripting or piping, add the `--json` flag to any command:

```bash
minara discover trending --json    # Raw JSON array of trending tokens
minara discover btc-metrics --json # Full BTC metrics with OHLCV data
minara assets spot --json          # Raw JSON asset list
```

### Configuration

| Command         | Description                                            |
| --------------- | ------------------------------------------------------ |
| `minara config` | View or update CLI settings (base URL, Touch ID, etc.) |

### Touch ID (macOS)

Minara CLI supports macOS Touch ID to protect all fund-related operations. When enabled, transfers, withdrawals, swaps, orders, and other financial actions require fingerprint verification before execution.

```bash
# You'll be prompted to enable Touch ID after login, or toggle manually:
minara config                     # Select "Touch ID" to enable / disable
```

**Protected operations:** `withdraw`, `transfer`, `swap`, `perps deposit`, `perps withdraw`, `perps order`, `limit-order create`, `copy-trade create`

> **Note:** Touch ID requires macOS with Touch ID hardware. The `--yes` flag skips confirmation prompts but does **not** bypass Touch ID — biometric verification is always enforced when enabled.

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

- **Touch ID** — Optional biometric protection for all fund operations (macOS only). A native Swift helper binary is compiled on first use and cached in `~/.minara/`
- Credentials are stored in `~/.minara/credentials.json` with `0600` file permissions
- The `~/.minara/` directory is created with `0700` permissions
- Tokens are never logged or printed to the console
- OAuth login uses a temporary local server that shuts down after the callback
- Non-TTY environments (CI/pipes) skip interactive prompts and return errors directly

## License

[MIT](LICENSE)
