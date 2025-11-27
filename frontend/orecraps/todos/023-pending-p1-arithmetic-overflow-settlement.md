---
status: completed
priority: p1
issue_id: "023"
tags: [security, solana-program, arithmetic, critical]
dependencies: ["022"]
resolved_date: 2025-11-27
---

# Arithmetic Overflow in Settlement Operations

## Problem Statement
Settlement logic in `settle_craps.rs` uses unchecked arithmetic for critical payout calculations, accumulating winnings, and house bankroll deductions. This could lead to integer overflow/underflow with catastrophic financial consequences.

## Findings
- **Location**: `/home/r/Coding/ore/program/src/settle_craps.rs`
- **Lines affected**: 416, 418, 422, 423, 428, 434
- **Vulnerable operations**:
```rust
// Line 416 - Pending winnings accumulation
craps_position.pending_winnings += total_winnings;

// Line 428 - House bankroll deduction
craps_game.house_bankroll -= net_payout;

// Line 434 - Alternative settlement path
craps_game.house_bankroll += total_lost - total_winnings;
```

## Scenario
1. User wins large bet with high payout ratio (e.g., 30:1 on Aces)
2. `pending_winnings += total_winnings` overflows
3. User receives fraction of owed amount OR
4. House bankroll underflows, wrapping to massive value
5. Protocol becomes insolvent

## Proposed Solutions

### Option 1: Comprehensive checked arithmetic
```rust
craps_position.pending_winnings = craps_position.pending_winnings
    .checked_add(total_winnings)
    .ok_or(ProgramError::ArithmeticOverflow)?;

craps_position.total_won = craps_position.total_won
    .checked_add(total_winnings)
    .ok_or(ProgramError::ArithmeticOverflow)?;

craps_game.house_bankroll = craps_game.house_bankroll
    .checked_sub(net_payout)
    .ok_or(ProgramError::InsufficientFunds)?;
```
- **Pros**: Complete protection, explicit errors, auditable
- **Cons**: Requires updating all arithmetic
- **Effort**: Medium
- **Risk**: Low

## Recommended Action
Implement checked arithmetic throughout settlement logic.

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/program/src/settle_craps.rs`
  - `/home/r/Coding/ore/program/src/craps_utils.rs` (calculate_payout)
- **Related Components**: All settlement logic, payout calculations
- **Database Changes**: No

## Resources
- Security Sentinel finding #1
- Data Integrity Guardian findings #1, #6
- Solana overflow protection patterns

## Acceptance Criteria
- [ ] All arithmetic in settlement replaced with checked versions
- [ ] `calculate_payout()` returns `Result<u64, ProgramError>`
- [ ] Truncation check added for u128 → u64 cast in payouts
- [ ] Tests for overflow edge cases
- [ ] Security audit of changes

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during security + data integrity audit
- Identified 6 critical arithmetic operations
- Categorized as P1 CRITICAL

## Notes
Source: Multi-agent code review
This is related to issue #022 but in different file/context.
