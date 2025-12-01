# OreCraps

Provably fair dice game on Solana with pari-mutuel mining and traditional craps betting.

## Stack

- **Program**: Rust/Solana (Anchor-style, but raw) at `/program/`
- **Frontend**: Next.js 14 + TypeScript + Tailwind at `/frontend/orecraps/`
- **State**: Zustand stores in `/src/store/`
- **Tokens**: RNG (staking) and CRAP (rewards), 9 decimals each

## Project Structure

```
/program/           Solana program (Rust)
/api/               Program bindings and instruction builders
/frontend/orecraps/ Next.js frontend
  /src/app/         Pages and API routes
  /src/components/  React components
  /src/hooks/       Custom hooks (useBoard, useCraps, useBetting)
  /src/store/       Zustand stores (game, craps, network, simulation)
  /src/services/    Transaction service, game service
  /src/lib/         Utilities, program bindings, network abstraction
```

## Key Commands

```bash
# Frontend
npm run dev          # Start dev server at localhost:3000
npm run build        # Verify TypeScript compiles
npm run lint         # ESLint check

# Program (from repo root)
cargo build-sbf --manifest-path program/Cargo.toml
```

## Core Concepts

- **Mining**: Stake RNG on 1-36 dice outcomes, win CRAP proportional to stake if correct
- **Craps**: Traditional betting (Pass Line, Don't Pass, Place bets, etc.)
- **Epochs**: Game rounds that end when 7 is rolled
- **On-chain only**: All dice results from blockchain entropy, never simulated

## Network Configuration

- Set `NEXT_PUBLIC_SOLANA_NETWORK` in `.env.local` (localnet/devnet)
- Localnet requires validator with program + token mints loaded
- Devnet requires token mints deployed (see docs/updates.md for status)

## Important Patterns

- Bet history tracking differentiates come-out vs point phase resolution
- Pass Line/Odds only resolve on point hit or seven-out, not other rolls
- Use `TransactionService` for all transaction building
- Use composite hooks (`useBetting`, `useGameSession`) over individual hooks

## Documentation

- `AGENTS.md` (repo root): Security patterns, localnet setup, CLI commands
- `docs/updates.md`: Detailed change log with code patterns
