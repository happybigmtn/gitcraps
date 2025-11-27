---
status: completed
priority: p1
issue_id: "022"
tags: [security, solana-program, arithmetic, critical]
dependencies: []
resolved_date: 2025-11-27
---

# Arithmetic Overflow in Bet Placement Operations

## Problem Statement
All bet accumulation operations in `place_craps_bet.rs` use unchecked `+=` arithmetic operators. This could lead to integer overflow/underflow, causing incorrect balance calculations and potential fund loss.

## Findings
- **Location**: `/home/r/Coding/ore/program/src/place_craps_bet.rs`
- **Lines affected**: 93, 102, 115, 128, 139, 149, 163, 177, 189, 205, 214, 219, 224, 229, 234, 239, 249, 253
- **15+ unchecked arithmetic operations** on critical financial values
- Example vulnerable code:
```rust
craps_position.pass_line += amount;
craps_position.dont_pass += amount;
craps_game.house_bankroll += amount;
```

## Scenario
1. User places multiple large bets on the same bet type
2. Total accumulation exceeds u64::MAX (18,446,744,073,709,551,615 lamports)
3. Integer overflow wraps around to small value
4. User loses funds OR house bankroll corrupted
5. Settlement calculations become incorrect

## Proposed Solutions

### Option 1: Use checked arithmetic (Recommended)
```rust
craps_position.pass_line = craps_position.pass_line
    .checked_add(amount)
    .ok_or(ProgramError::ArithmeticOverflow)?;

craps_game.house_bankroll = craps_game.house_bankroll
    .checked_add(amount)
    .ok_or(ProgramError::ArithmeticOverflow)?;
```
- **Pros**: Explicit error handling, fail-safe, Rust best practice
- **Cons**: Slightly more verbose
- **Effort**: Small
- **Risk**: Low

### Option 2: Use saturating arithmetic
```rust
craps_position.pass_line = craps_position.pass_line.saturating_add(amount);
```
- **Pros**: Simple, never panics
- **Cons**: Silently caps at MAX, not appropriate for financial operations
- **Effort**: Small
- **Risk**: Medium (silent behavior change)

## Recommended Action
Implement Option 1 - checked arithmetic with explicit error handling.

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/program/src/place_craps_bet.rs`
- **Related Components**: All bet placement logic
- **Database Changes**: No

## Resources
- Security Sentinel audit finding #1
- Data Integrity Guardian finding #1
- Solana security best practices

## Acceptance Criteria
- [ ] All `+=` operations on financial values replaced with `checked_add()`
- [ ] All `-=` operations replaced with `checked_sub()`
- [ ] Proper error propagation with `?` operator
- [ ] Unit tests with u64::MAX edge cases
- [ ] Code reviewed by security-focused reviewer

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during comprehensive security audit
- Identified 15+ vulnerable arithmetic operations
- Categorized as P1 CRITICAL - financial risk

## Notes
Source: Multi-agent code review - Security Sentinel + Data Integrity Guardian
This issue affects the core financial integrity of the system.
