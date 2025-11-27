---
status: completed
priority: p1
issue_id: "028"
tags: [security, solana-program, data-integrity, critical]
dependencies: []
resolved_date: 2025-11-27
---

# Missing Epoch Validation Causes Permanent Fund Loss

## Problem Statement
When a user's position is from a different epoch than the current game, the settlement silently skips without refunding active bets. This means users lose their funds when epochs advance unexpectedly.

## Findings
- **Location**: `/home/r/Coding/ore/program/src/settle_craps.rs:59-63`
- **Vulnerable code**:
```rust
// Check if position is for current epoch.
if craps_position.epoch_id != craps_game.epoch_id {
    sol_log("Position is from different epoch, skipping settlement");
    return Ok(());  // SILENTLY RETURNS - BETS LOST!
}
```
- **Related issue**: `/home/r/Coding/ore/api/src/state/craps_position.rs:181-187`
```rust
pub fn reset_for_epoch(&mut self, epoch_id: u64) {
    self.epoch_id = epoch_id;
    self.clear_all_bets();  // ALL BETS CLEARED WITHOUT REFUND!
    // ...
}
```

## Scenario
1. User places 5 SOL in bets during epoch N
2. Seven-out occurs, epoch advances to N+1
3. User's position still has `epoch_id = N`
4. User calls settle_craps
5. Code logs "skipping settlement" and returns Ok(())
6. User's 5 SOL in bets are never settled or refunded
7. Funds permanently locked

## Proposed Solutions

### Option 1: Auto-refund old epoch bets (Recommended)
```rust
if craps_position.epoch_id != craps_game.epoch_id {
    sol_log("Position from different epoch - refunding active bets");

    // Calculate total active bets
    let total_refund = craps_position.total_active_bets();

    // Refund via pending_winnings
    craps_position.pending_winnings = craps_position.pending_winnings
        .checked_add(total_refund)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    // Reset for new epoch
    craps_position.reset_for_epoch(craps_game.epoch_id);

    sol_log(&format!("Refunded {} lamports from old epoch", total_refund));
    return Ok(());
}
```
- **Pros**: Users get funds back, graceful handling
- **Cons**: Adds complexity
- **Effort**: Medium
- **Risk**: Low

### Option 2: Fail with explicit error
```rust
if craps_position.epoch_id != craps_game.epoch_id {
    sol_log("ERROR: Position from different epoch - manual reset required");
    return Err(ProgramError::Custom(EPOCH_MISMATCH));
}
```
- **Pros**: Explicit failure, no silent data loss
- **Cons**: User must call separate reset instruction
- **Effort**: Small
- **Risk**: Low

## Recommended Action
Implement Option 1 - auto-refund provides best UX.

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/program/src/settle_craps.rs`
  - `/home/r/Coding/ore/api/src/state/craps_position.rs`
- **Related Components**: Settlement logic, epoch management
- **Database Changes**: No

## Resources
- Data Integrity Guardian finding #5
- Data Integrity Guardian finding #15

## Acceptance Criteria
- [ ] Epoch mismatch triggers automatic refund
- [ ] `total_active_bets()` helper function implemented
- [ ] Refund added to `pending_winnings`
- [ ] Position properly reset to new epoch
- [ ] Integration test for epoch transition with active bets
- [ ] Log messages clearly indicate refund amount

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered fund-locking vulnerability during data integrity audit
- Identified silent failure pattern
- Categorized as P1 CRITICAL - user fund loss

## Notes
Source: Multi-agent code review - Data Integrity Guardian
This is a user-impacting bug that could cause significant trust issues.
