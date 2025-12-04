# Game Testing Todo

## Issues Resolved

### Mining (RNG)
- [x] Round ID = 0, no active round - FIXED: StartRound instruction

### ThreeCard Poker
- [x] "Player already has active bets" - FIXED: Deal + Fold to reset position

### VideoPoker
- [x] "Position state is 1" - FIXED: Settled/claimed

### SwapPanel
- [x] Component integrated into Stake tab via StakeLayout.tsx

## Settlement Tasks (All Complete)

- [x] Settle ThreeCard active bets
- [x] Settle VideoPoker active hand
- [x] Start a mining round
- [x] Integrate SwapPanel into Stake tab

## Full Test Round (All Complete - Devnet)

- [x] Blackjack - place, deal, play, settle, claim
- [x] Baccarat - place, settle, claim
- [x] Roulette - place, settle, claim
- [x] War - place, settle, claim
- [x] SicBo - place, settle, claim
- [x] ThreeCard - place bet, deal, fold (auto-resets when no winnings)
- [x] VideoPoker - place, deal, hold, settle, claim
- [x] UTH - place, deal, play, settle, claim
- [x] Craps - place bets (Field, Place 6), settle, claim

## Swap Testing (All Complete)

- [x] SOL -> RNG swap: 0.1 SOL → ~6.6 RNG (SUCCESS)
- [x] RNG -> SOL swap: 5 RNG → SOL (SUCCESS)
- [x] Protocol fees accumulating correctly

## Test Scripts Created

- `test-tcp-full.mjs` - Full ThreeCard Poker test cycle
- `resolve-tcp-position.mjs` - Fix stuck TCP positions
- `check-tcp-position-v2.mjs` - Detailed position state inspection
- `test-swap-devnet.mjs` - Exchange pool swap verification

## Key Findings

### ThreeCard Position Struct Offsets (with 8-byte discriminator)
- authority: offset 8 (32 bytes)
- state: offset 56 (1 byte)
- ante: offset 64 (8 bytes)
- play: offset 72 (8 bytes)
- pair_plus: offset 80 (8 bytes)
- pending_winnings: offset 104 (8 bytes)

### Token Mint Addresses (Devnet)
- TCP_MINT: `3UTs2U6ps5z1asibwgtCZAtbatuKGcqX85QJ7zZBvvth`
- CRAP_MINT (localnet): `7frAenkamJSASBH9YukkzBsSMz9paQdYuSGw4SjWkXrf`
