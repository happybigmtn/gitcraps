---
status: completed
priority: p2
issue_id: "039"
tags: [architecture, solana-program, refactoring]
dependencies: ["034"]
resolved_date: 2025-11-27
---

# God Function: settle_craps (472 Lines)

## Problem Statement
The `settle_craps` function is 472 lines with 4-5 levels of nesting, handling 12+ different bet types in a single monolithic function. This makes it difficult to audit, test, and maintain.

## Findings
- **Location**: `/home/r/Coding/ore/program/src/settle_craps.rs`
- **Size**: 472 lines (largest program file)
- **Bet types handled**: Pass Line, Don't Pass, Come, Don't Come, Place, Hardways, Field, Any Seven, Any Craps, Yo, Aces, Twelve
- **Nesting depth**: 4-5 levels in places
- **Issues**:
  - Hard to add new bet types
  - Difficult to audit for security
  - No unit testing possible for individual bet logic

## Proposed Solutions

### Option 1: Strategy pattern for bet settlers (Recommended)
```rust
// Define trait for bet settlement
trait BetSettler {
    fn can_settle(&self, dice_sum: u8, is_hard: bool, game: &CrapsGame) -> bool;
    fn settle(&self, position: &mut CrapsPosition, dice_sum: u8, is_hard: bool) -> SettleResult;
}

// Implementations
struct PassLineBetSettler;
impl BetSettler for PassLineBetSettler {
    fn can_settle(&self, _dice_sum: u8, _is_hard: bool, game: &CrapsGame) -> bool {
        game.is_coming_out()
    }
    fn settle(&self, position: &mut CrapsPosition, dice_sum: u8, _is_hard: bool) -> SettleResult {
        // ~30 lines of Pass Line logic
    }
}

struct FieldBetSettler;
struct HardwayBetSettler;
// ... etc for each bet type

// Main function becomes simple dispatch
pub fn process_settle_craps(accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    // Validation...

    let settlers: Vec<&dyn BetSettler> = vec![
        &PassLineBetSettler,
        &FieldBetSettler,
        &HardwayBetSettler,
        // ...
    ];

    let mut totals = SettleTotals::default();
    for settler in settlers {
        if settler.can_settle(dice_sum, is_hard, &craps_game) {
            let result = settler.settle(&mut craps_position, dice_sum, is_hard);
            totals.add(result);
        }
    }

    // Finalize totals...
}
```
- **Pros**: Extensible, testable, clear separation
- **Cons**: More boilerplate, trait objects
- **Effort**: Large
- **Risk**: Medium

### Option 2: Extract helper functions
```rust
fn settle_single_roll_bets(
    position: &mut CrapsPosition,
    dice_sum: u8,
) -> (u64, u64) {
    // Field, Any Seven, Any Craps, Yo, Aces, Twelve
}

fn settle_hardway_bets(
    position: &mut CrapsPosition,
    dice_sum: u8,
    is_hard: bool,
) -> (u64, u64) {
    // All hardway logic
}

fn settle_come_out_roll(
    position: &mut CrapsPosition,
    game: &mut CrapsGame,
    dice_sum: u8,
) -> (u64, u64) {
    // Pass/Don't Pass come-out
}

fn settle_point_roll(
    position: &mut CrapsPosition,
    game: &mut CrapsGame,
    dice_sum: u8,
) -> (u64, u64) {
    // Pass/Don't Pass point phase
}
```
- **Pros**: Simpler than traits, still testable
- **Cons**: Still somewhat coupled
- **Effort**: Medium
- **Risk**: Low

## Recommended Action
Implement Option 2 first (quicker), consider Option 1 for future extensibility.

## Target Structure
```
program/src/
├── settle_craps.rs (~150 lines - main coordinator)
├── settle_single_roll.rs (~100 lines)
├── settle_hardways.rs (~60 lines)
├── settle_line_bets.rs (~120 lines)
└── settle_utils.rs (~50 lines - shared helpers)
```

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/program/src/settle_craps.rs`
- **New Files**: 3-4 new modules
- **Related Components**: All settlement logic
- **Database Changes**: No

## Acceptance Criteria
- [ ] Main settle_craps reduced to <200 lines
- [ ] Each bet category in separate function/module
- [ ] Unit tests for each bet settlement function
- [ ] All existing bet logic preserved
- [ ] No compute unit regression
- [ ] Security review of refactored code

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during architecture + pattern analysis
- Identified 12 bet types mixed in single function
- Categorized as P2 IMPORTANT

## Notes
Source: Multi-agent code review - Architecture Strategist, Pattern Recognition
Code Simplicity Reviewer estimates 150 LOC reduction (32%) possible.
