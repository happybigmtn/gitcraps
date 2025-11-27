---
status: completed
priority: p1
issue_id: "027"
tags: [security, solana-program, reentrancy, critical]
dependencies: []
resolved_date: 2025-11-27
---

# Reentrancy Pattern in Claim Winnings - State Modified After Transfer

## Problem Statement
The `claim_craps_winnings` instruction clears `pending_winnings` AFTER the SOL transfer. This violates the Check-Effects-Interactions pattern and could allow double-claims if the transfer fails mid-execution.

## Findings
- **Location**: `/home/r/Coding/ore/program/src/claim_craps_winnings.rs:54-58`
- **Vulnerable code**:
```rust
// Transfer SOL from craps game to user.
craps_game_info.send(amount, &signer_info);  // INTERACTION FIRST

// Clear pending winnings.
craps_position.pending_winnings = 0;  // EFFECT SECOND (WRONG ORDER!)
```

## Scenario
1. User has 10 SOL in `pending_winnings`
2. User calls `claim_craps_winnings`
3. `send()` transfers funds but transaction fails afterward
4. `pending_winnings` not cleared (still 10 SOL)
5. User retries claim - gets another 10 SOL
6. House drained beyond intended payout

## Proposed Solutions

### Option 1: Clear state before transfer (Recommended)
```rust
// Store amount and clear FIRST (Effects before Interactions)
let amount = craps_position.pending_winnings;
craps_position.pending_winnings = 0;

// THEN transfer
craps_game_info.send(amount, &signer_info)?;
```
- **Pros**: Follows CEI pattern, standard security practice
- **Cons**: If send fails, user must reclaim (but this is safer)
- **Effort**: Small
- **Risk**: Low

### Option 2: Use reentrancy guard
```rust
if craps_position.claiming_in_progress {
    return Err(ProgramError::Custom(CLAIM_IN_PROGRESS));
}
craps_position.claiming_in_progress = true;
// ... transfer logic
craps_position.claiming_in_progress = false;
```
- **Pros**: Explicit protection
- **Cons**: Requires new state field, more complex
- **Effort**: Medium
- **Risk**: Low

## Recommended Action
Implement Option 1 - clear state before transfer.

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/program/src/claim_craps_winnings.rs`
- **Related Components**: Claim logic
- **Database Changes**: No

## Resources
- Data Integrity Guardian finding #4
- Solana security best practices
- Check-Effects-Interactions pattern

## Acceptance Criteria
- [ ] `pending_winnings` cleared BEFORE `send()` call
- [ ] Amount stored in local variable before clearing
- [ ] Proper error propagation if send fails
- [ ] Integration test for claim failure scenario
- [ ] Security review of fix

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered CEI violation during data integrity audit
- Identified double-claim risk
- Categorized as P1 CRITICAL

## Notes
Source: Multi-agent code review - Data Integrity Guardian
While Solana's single-threaded execution prevents some reentrancy, the CEI pattern is still important for transaction failure scenarios.
