---
status: completed
priority: p2
issue_id: "031"
tags: [security, solana-program, validation, economics]
dependencies: ["024"]
resolved_date: 2025-11-27
---

# Missing Maximum Bet Validation

## Problem Statement
The bet placement only validates that amount is non-zero but doesn't enforce maximum bet limits. Users can place bets larger than the house can pay, creating insolvency risk.

## Findings
- **Location**: `/home/r/Coding/ore/program/src/place_craps_bet.rs:76-79`
- **Current validation**:
```rust
// Validate bet amount.
if amount == 0 {
    return Err(ProgramError::InvalidArgument);
}
// NO MAXIMUM CHECK!
```

## Risks
1. User places bet larger than house bankroll
2. User wins, house cannot pay (see issue #024)
3. Griefing: place huge bets to lock house funds
4. Economic imbalance in game design

## Proposed Solutions

### Option 1: Implement bet limits (Recommended)
```rust
// Constants
const MAX_BET_AMOUNT: u64 = LAMPORTS_PER_SOL * 100; // 100 SOL absolute max

// Validation
if amount == 0 {
    return Err(ProgramError::InvalidArgument);
}

if amount > MAX_BET_AMOUNT {
    sol_log("Bet exceeds absolute maximum");
    return Err(ProgramError::InvalidArgument);
}

// Dynamic limit based on house bankroll (e.g., 1% of bankroll)
let max_potential_payout = calculate_max_payout(bet_type, amount);
let max_allowed = craps_game.house_bankroll / 100;
if max_potential_payout > craps_game.house_bankroll {
    sol_log("Bet exceeds house bankroll capacity");
    return Err(ProgramError::InsufficientFunds);
}
```
- **Pros**: Protects house, fair game economics
- **Cons**: Limits high rollers
- **Effort**: Small
- **Risk**: Low

### Option 2: Reserved bankroll for payouts
- Reserve portion of bankroll for maximum payouts
- More complex accounting
- **Effort**: Medium

## Recommended Action
Implement Option 1 with both absolute max and bankroll-relative limits.

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/program/src/place_craps_bet.rs`
  - `/home/r/Coding/ore/api/src/consts.rs` (add constants)
- **Related Components**: Bet placement, house management
- **Database Changes**: No

## Acceptance Criteria
- [ ] MAX_BET_AMOUNT constant defined
- [ ] Absolute maximum enforced
- [ ] Dynamic limit based on house bankroll
- [ ] Clear error messages for limit violations
- [ ] Frontend displays max bet to users

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during security + data integrity audit
- Economic risk assessment
- Categorized as P2 IMPORTANT

## Notes
Source: Multi-agent code review - Security Sentinel #9, Data Integrity Guardian #11
Related to issue #024 (house bankroll validation).
