# RSOC - Random State On Chain

Provably fair casino games platform on Solana with on-chain randomness, token-based betting, and staking yield.

## Games

| Game | Description | House Edge |
|------|-------------|------------|
| **Craps** | Traditional dice game with Pass/Don't Pass, Come/Don't Come, Place bets | ~1.4% |
| **Roulette** | European-style single-zero wheel | 2.7% |
| **Blackjack** | Classic 21 with standard rules | ~0.5% |
| **Baccarat** | Punto banco with Player/Banker/Tie | ~1.2% |
| **Casino War** | Card comparison with war/surrender options | ~2.9% |
| **Three Card Poker** | Ante/Play with Pair Plus side bet | ~3.4% |
| **Video Poker** | Jacks or Better with hold/draw | ~0.5% |
| **Sic Bo** | Three-dice betting with 50+ bet types | Varies |
| **Ultimate Texas Hold'em** | Full poker with preflop/flop/river betting | ~2.2% |

## Architecture

```
/program/           Solana program (Rust)
  /src/craps/       Craps game logic
  /src/blackjack/   Blackjack game logic
  /src/baccarat/    Baccarat game logic
  /src/roulette/    Roulette game logic
  /src/war/         Casino War game logic
  /src/threecard/   Three Card Poker logic
  /src/videopoker/  Video Poker logic
  /src/sicbo/       Sic Bo logic
  /src/uth/         Ultimate Texas Hold'em logic
  /src/staking/     RNG staking and yield
  /src/exchange/    Token swap and liquidity
  /src/admin/       Admin functions

/api/               Program SDK and type definitions
  /src/instruction.rs   Instruction builders
  /src/state/           Account structures

/frontend/orecraps/ Next.js frontend
  /src/components/  Game UI components
  /src/hooks/       React hooks per game
  /src/store/       Zustand state management
  /src/lib/         Program bindings
```

## Tokens

- **RNG** - Staking token (9 decimals)
- **CRAP** - Reward/betting token (9 decimals)
- Game-specific tokens share the CRAP mint

## Key Features

- **On-chain randomness** - All outcomes derived from Solana slot hashes
- **Provably fair** - Verifiable randomness, no server-side RNG
- **House bankroll** - Per-game bankroll with reserved payouts
- **Staking yield** - Stake RNG to earn from house profits
- **Token exchange** - Swap between game tokens and SOL

## Instructions

### Gaming
- `PlaceBet` - Place a bet on any game
- `Deal` / `Roll` - Trigger game action
- `Settle` - Resolve game outcome
- `Claim` - Withdraw winnings

### Staking
- `Deposit` - Stake RNG tokens
- `Withdraw` - Unstake RNG tokens
- `ClaimYield` - Claim staking rewards
- `ClaimRngYield` - Claim RNG yield distribution

### Exchange
- `InitializePool` - Create liquidity pool
- `AddLiquidity` - Provide liquidity
- `RemoveLiquidity` - Withdraw liquidity
- `SwapSolRng` - Swap SOL for RNG
- `SwapGameToken` - Swap between game tokens

### Admin
- `Initialize` - Initialize game state
- `FundHouse` - Add to house bankroll
- `SetAdmin` - Transfer admin authority
- `MigrateStake` / `MigrateTreasury` - Data migrations

## Development

### Prerequisites
- Rust 1.75+
- Solana CLI 1.18+
- Node.js 18+
- Anchor (optional, raw Solana program)

### Build Program
```bash
cargo build-sbf --manifest-path program/Cargo.toml
```

### Run Tests
```bash
cargo test-sbf
```

### Frontend Development
```bash
cd frontend/orecraps
npm install
npm run dev
```

### Deploy to Devnet
```bash
solana program deploy target/deploy/ore.so --program-id <KEYPAIR>
```

## Network Configuration

Set environment variables in `frontend/orecraps/.env.local`:

```env
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_RPC_ENDPOINT=https://api.devnet.solana.com
```

## Program ID

```
JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK
```

## Security

This software is unaudited. Use at your own risk.

Key security considerations:
- Randomness derived from slot hashes (validator manipulation possible)
- House bankroll limits maximum payouts
- All state transitions validated on-chain

## License

Apache 2.0
