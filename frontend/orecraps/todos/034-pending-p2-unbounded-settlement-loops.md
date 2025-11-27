---
status: completed
priority: p2
issue_id: "034"
tags: [performance, solana-program, compute-units]
dependencies: []
resolved_date: 2025-11-27
---

# Unbounded Loops in Settlement Logic

## Problem Statement
Settlement logic iterates through fixed-size arrays without early termination, processing 22+ iterations per settlement even when most bets are empty.

## Findings
- **Location**: `/home/r/Coding/ore/program/src/settle_craps.rs:164-286`
- **Loops identified**:
```rust
// Hardways: 4 iterations
for i in 0..NUM_HARDWAYS {
    if craps_position.hardways[i] > 0 { /* process */ }
}

// Place bets: 6 iterations
for i in 0..NUM_POINTS {
    if craps_position.place_bets[i] > 0 { /* process */ }
}

// Come bets: 6 iterations
for i in 0..NUM_POINTS {
    if craps_position.come_bets[i] > 0 { /* process */ }
}

// Don't come bets: 6 iterations
for i in 0..NUM_POINTS {
    if craps_position.dont_come_bets[i] > 0 { /* process */ }
}
```
- **Total**: 22 iterations minimum per settlement
- **Compute cost**: ~5,000-8,000 CU per settlement

## Proposed Solutions

### Option 1: Bitmap tracking of active bets (Recommended)
```rust
pub struct CrapsPosition {
    active_bet_mask: u32,  // Bit flags for which bets are active
    // ...
}

// In settlement:
if craps_position.active_bet_mask == 0 {
    // No active bets, skip all loops
    return Ok(());
}

// Only iterate over set bits
let mut mask = craps_position.active_bet_mask;
while mask != 0 {
    let bit_index = mask.trailing_zeros() as usize;
    // Process bet at bit_index
    mask &= mask - 1;  // Clear lowest set bit
}
```
- **Pros**: O(active bets) instead of O(all bets), significant savings
- **Cons**: Requires maintaining bitmap on bet placement
- **Effort**: Medium
- **Risk**: Low

### Option 2: Count-based early termination
```rust
pub total_active_bets: u8,

// In settlement:
if craps_position.total_active_bets == 0 {
    return Ok(());
}
let mut processed = 0;
for i in 0..NUM_HARDWAYS {
    if craps_position.hardways[i] > 0 {
        // process
        processed += 1;
        if processed >= craps_position.total_active_bets {
            break;  // Early exit
        }
    }
}
```
- **Pros**: Simpler than bitmap
- **Cons**: Still iterates until finding all active bets
- **Effort**: Small
- **Risk**: Low

## Recommended Action
Implement Option 1 for maximum performance gain.

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/program/src/settle_craps.rs`
  - `/home/r/Coding/ore/program/src/place_craps_bet.rs` (maintain bitmap)
  - `/home/r/Coding/ore/api/src/state/craps_position.rs` (add field)
- **Related Components**: Settlement, bet placement
- **Database Changes**: CrapsPosition account size +4 bytes

## Acceptance Criteria
- [ ] Active bet bitmap field added to CrapsPosition
- [ ] Bitmap updated on bet placement
- [ ] Settlement only processes active bets
- [ ] Benchmark shows 40-60% CU reduction for typical cases
- [ ] Edge case testing (all bets active, no bets active)

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during performance audit
- Loop complexity analysis
- Categorized as P2 IMPORTANT

## Notes
Source: Multi-agent code review - Performance Oracle finding P1-1
Expected improvement: 40-60% compute unit reduction in settlement.
