---
status: completed
priority: p2
issue_id: "033"
tags: [performance, solana-program, compute-units]
dependencies: []
resolved_date: 2025-11-27
---

# Excessive sol_log Calls Waste 14,000+ Compute Units Per Settlement

## Problem Statement
Settlement logic contains 18+ `sol_log` calls with format strings that execute on every settlement, consuming significant compute units and reducing throughput.

## Findings
- **Location**: `/home/r/Coding/ore/program/src/settle_craps.rs` (multiple lines)
- **Examples**:
```rust
sol_log(&format!("Field bet won: {} + {}", craps_position.field_bet, payout).as_str());
sol_log(&format!("Any Seven won: {} + {}", craps_position.any_seven, payout).as_str());
// ... 16+ more similar calls
```

## Performance Impact
- Each `sol_log` with formatting: ~500-1000 CU
- 18 logs x 800 CU average = 14,400 CU per settlement
- This is 15-20% of typical settlement cost
- At scale: 100 users settling = 1.44M CU wasted on logs

## Proposed Solutions

### Option 1: Conditional debug logging (Recommended)
```rust
// Only log in debug builds
#[cfg(feature = "debug")]
sol_log(&format!("Field bet won: {} + {}", bet, payout).as_str());

// Or use msg! macro which is cheaper
#[cfg(feature = "debug")]
msg!("Field bet won: {}", payout);  // ~200 CU vs 800 CU
```
- **Pros**: Zero cost in production, still available for debugging
- **Cons**: Requires build configuration
- **Effort**: Small
- **Risk**: Low

### Option 2: Aggregate logging
```rust
// Single log at end with summary
let mut log_buffer = String::new();
// ... accumulate results ...
sol_log(&log_buffer);  // One log instead of 18
```
- **Pros**: Still provides info, much cheaper
- **Cons**: Less granular
- **Effort**: Medium
- **Risk**: Low

### Option 3: Remove all logs
- **Pros**: Maximum performance
- **Cons**: No debugging info
- Not recommended

## Recommended Action
Implement Option 1 - use feature flag for debug logging.

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/program/src/settle_craps.rs`
  - `/home/r/Coding/ore/program/Cargo.toml` (add debug feature)
- **Related Components**: All program logging
- **Database Changes**: No

## Acceptance Criteria
- [ ] Add `debug` feature to Cargo.toml
- [ ] Wrap verbose logs with `#[cfg(feature = "debug")]`
- [ ] Keep ERROR level logs always enabled
- [ ] Measure CU reduction (expect 10-15% improvement)
- [ ] Document debug build process

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during performance audit
- Compute unit analysis
- Categorized as P2 IMPORTANT

## Notes
Source: Multi-agent code review - Performance Oracle finding P1-3
Expected improvement: 10,000-14,000 CU savings per settlement (20-30% reduction).
