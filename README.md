<p align="center">
  <h1 align="center">Minara CLI</h1>
  <p align="center">
    AI-powered crypto trading from the terminal.
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/minara"><img alt="npm" src="https://img.shields.io/npm/v/minara?color=cb3837"></a>
  <img alt="Node.js" src="https://img.shields.io/badge/node-%3E%3D18-brightgreen">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

---

## Install

```bash
npm install -g minara
```

Or run without installing:

```bash
npx minara --help
```

## Quick Start

```bash
minara login                    # Device code (default) or email
minara account                  # View account & wallet addresses
minara ask "What's BTC price?"  # Quick AI chat (fast mode)
minara swap -s buy -t '$BONK' -a 100  # Swap tokens
```

## Commands

### Auth & Account

```bash
minara login                    # Interactive: device code or email
minara login --device           # Device code flow (opens browser)
minara login -e user@mail.com   # Email verification code
minara logout
minara account
```

### Wallet & Balance

```bash
minara balance                  # Combined USDC/USDT across spot + perps
minara assets                   # Full overview
minara assets spot              # Portfolio, PnL, holdings
minara assets perps             # Equity, margin, positions

# Deposit / receive
minara receive                  # Interactive menu
minara receive spot             # Show EVM + Solana deposit addresses
minara receive perps            # Arbitrum address or transfer from Spot
minara receive perps --address  # Non-interactive: show address only
minara deposit                  # Alias for receive

# Withdraw
minara withdraw -c solana -t '$SOL' -a 10 --to <address>
```

### Spot Trading

```bash
minara swap                     # Interactive
minara swap -s buy -t '$BONK' -a 100    # Buy $100 worth
minara swap -s sell -t '$NVDAx' -a all  # Sell entire balance
minara swap --dry-run                  # Simulate without executing

minara send -c solana -t '$SOL' -a 5 --to <address>
minara transfer                  # Alias for send
```

**Token input:** `-t` accepts `$TICKER`, token name, or contract address. Chain is auto-detected.

### Perpetual Futures

```bash
minara perps                    # Interactive menu
minara perps positions          # All wallets with PnL
minara perps positions -w Bot-1 # Specific wallet
minara perps order              # Interactive order builder
minara perps order -S long -s BTC -z 0.1 -T market  # Non-interactive
minara perps close              # Close position at market
minara perps close --all        # Close all positions
minara perps close -s ETH       # Close by symbol
minara perps cancel             # Select from open orders
minara perps leverage           # Update leverage for a symbol
minara perps trades             # Recent fills (7 days)
minara perps trades -d 30       # Last 30 days
minara perps deposit -a 100     # Deposit USDC
minara perps withdraw -a 50     # Withdraw USDC
```

**Multi-wallet:** Most perps commands accept `-w, --wallet <name>` to target a sub-wallet.

**Order flags:** `-S/--side` (long/buy/short/sell), `-s/--symbol`, `-T/--type` (market/limit), `-p/--price`, `-z/--size`, `-r/--reduce-only`, `-g/--grouping`, `--tpsl` (tp/sl).

### AI Trading Bots

```bash
minara perps wallets            # List sub-wallets with balances & autopilot
minara perps create-wallet -n Bot-1
minara perps rename-wallet
minara perps autopilot          # Strategy dashboard per wallet
minara perps autopilot -w Bot-1 # Manage specific wallet
minara perps sweep              # Consolidate sub-wallet to default
minara perps transfer           # Transfer USDC between wallets
minara perps ask                # AI long/short analysis + quick order
```

**Autopilot:** When ON, manual orders are blocked on that wallet. Turn off first to trade manually.

### Limit Orders

```bash
minara limit-order create       # Interactive
minara limit-order create --chain solana --side buy --token '$BONK' \
  --condition above --price 0.0001 --amount 100 --expiry 24
minara limit-order list
minara limit-order cancel <id>
```

### AI Chat

```bash
minara ask "What's SOL price?"  # Fast mode (quick answers)
minara research "Analyze ETH"   # Quality mode (deep analysis)
minara chat                     # Interactive REPL
minara chat "Explain DeFi"      # Single message
minara chat --quality           # Quality mode
minara chat --thinking          # Enable reasoning mode
minara chat -c <chatId>         # Continue conversation
minara chat --list              # List past chats
minara chat --history <id>      # View conversation
```

**REPL commands:** `/new`, `/continue`, `/list`, `/id`, `exit`

### Market Discovery

```bash
minara discover trending        # Tokens (default) or stocks
minara discover trending -t stocks
minara discover search SOL
minara discover search "apple" -t stocks
minara discover fear-greed      # Crypto Fear & Greed Index
minara discover btc-metrics     # Bitcoin on-chain data
```

### Premium

```bash
minara premium plans            # View plans & credit packages
minara premium status           # Current subscription
minara premium subscribe        # Subscribe or change plan
minara premium cancel           # Cancel at period end
```

### Output Format

```bash
minara discover trending --json
minara assets spot --json
```

### Configuration

```bash
minara config                   # Interactive settings
```

| Setting | Default | Description |
|---------|---------|-------------|
| Touch ID | Off | Biometric verification for fund operations (macOS) |
| Transaction Confirmation | **On** | Mandatory confirmation before fund ops |

## Transaction Safety

1. **First confirmation** — skippable with `-y`
2. **Transaction confirmation** — shows chain, token, address, amount; configurable
3. **Touch ID** — optional, macOS only
4. **Execute**

## Supported Chains

Ethereum, Base, Arbitrum, Optimism, Polygon, Avalanche, Solana, BSC, Berachain, Blast, Manta, Mode, Sonic, and more.

## Development

```bash
npm install
npm run build        # Compile TypeScript
npm run dev          # Watch mode
npm test             # Run 270 tests
npm run test:coverage
```

## License

[MIT](LICENSE)
