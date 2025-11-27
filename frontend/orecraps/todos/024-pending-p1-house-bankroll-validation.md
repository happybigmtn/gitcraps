---
status: completed
priority: p1
issue_id: "024"
tags: [security, solana-program, validation, critical]
dependencies: ["023"]
resolved_date: 2025-11-27
---

# Insufficient House Bankroll Validation - Only Logs Warning

## Problem Statement
The house bankroll check in settlement only logs a warning but continues processing when the house cannot pay winnings. This creates a state where users have `pending_winnings` that can never be claimed, effectively locking their funds.

## Findings
- **Location**: `/home/r/Coding/ore/program/src/settle_craps.rs:427-432`
- **Vulnerable code**:
```rust
if craps_game.house_bankroll >= net_payout {
    craps_game.house_bankroll -= net_payout;
} else {
    sol_log("Warning: House bankroll insufficient for payout");
    // This shouldn't happen with proper bankroll management.
    // BUT IT CONTINUES EXECUTION!
}
```

## Scenario
1. House bankroll: 100 SOL
2. User wins 150 SOL payout
3. Code logs warning but `pending_winnings += 150 SOL` still executes
4. User calls `claim_craps_winnings`
5. Claim fails (insufficient funds) but `pending_winnings` still shows 150 SOL
6. User funds effectively locked forever

## Proposed Solutions

### Option 1: Fail transaction on insufficient funds (Recommended)
```rust
if craps_game.house_bankroll < net_payout {
    sol_log("ERROR: Insufficient house bankroll for payout");
    return Err(ProgramError::InsufficientFunds);
}

craps_game.house_bankroll = craps_game.house_bankroll
    .checked_sub(net_payout)
    .ok_or(ProgramError::ArithmeticOverflow)?;
```
- **Pros**: Fail-safe, prevents locked funds, clear error
- **Cons**: Settlement fails (but this is correct behavior)
- **Effort**: Small
- **Risk**: Low

### Option 2: Partial payout with escrow
```rust
let available_payout = std::cmp::min(net_payout, craps_game.house_bankroll);
craps_position.pending_winnings += available_payout;
craps_position.escrowed_winnings += net_payout - available_payout;
craps_game.house_bankroll = 0;
```
- **Pros**: Partial payment, tracks debt
- **Cons**: Complex, requires escrow mechanism
- **Effort**: Large
- **Risk**: Medium

## Recommended Action
Implement Option 1 - fail transaction when house cannot pay.

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/program/src/settle_craps.rs`
- **Related Components**: Settlement logic, claim logic
- **Database Changes**: No

## Resources
- Security Sentinel finding #2
- Data Integrity Guardian finding #3

## Acceptance Criteria
- [ ] Transaction fails with `InsufficientFunds` when house cannot pay
- [ ] No increment of `pending_winnings` without corresponding bankroll deduction
- [ ] Log message is ERROR not WARNING
- [ ] Integration test for bankroll exhaustion scenario
- [ ] Documentation updated about bankroll requirements

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during security audit
- Identified funds-locking vulnerability
- Categorized as P1 CRITICAL

## Notes
Source: Multi-agent code review - Security Sentinel
Consider also implementing max bet limits relative to house bankroll (see issue #031).
