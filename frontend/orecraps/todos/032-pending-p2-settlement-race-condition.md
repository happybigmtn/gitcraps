---
status: completed
priority: p2
issue_id: "032"
tags: [security, solana-program, concurrency]
dependencies: []
resolved_date: 2025-11-27
---

# Race Condition in Settlement - Potential Double Payout

## Problem Statement
Settlement checks if already settled for a round but the check-then-update pattern could allow concurrent settlements in edge cases, potentially resulting in double payouts.

## Findings
- **Location**: `/home/r/Coding/ore/program/src/settle_craps.rs:66-69`
- **Code**:
```rust
// Check if already settled for this round.
if craps_position.last_updated_round >= round.id {
    sol_log("Already settled for this round");
    return Ok(());  // Returns success, doesn't error
}
// ... settlement logic ...
craps_position.last_updated_round = round.id;  // Update after processing
```

## Risk Scenario
1. Round 5 completes
2. User submits two settle transactions simultaneously
3. Both pass the `last_updated_round < round.id` check
4. Both execute settlement logic
5. User receives double payout

Note: Solana's single-threaded execution per account mitigates this, but returning `Ok(())` instead of error could mask issues.

## Proposed Solutions

### Option 1: Return error for already-settled (Recommended)
```rust
if craps_position.last_updated_round >= round.id {
    sol_log("Already settled for this round");
    return Err(ProgramError::Custom(ALREADY_SETTLED));  // Error instead of Ok
}
```
- **Pros**: Explicit failure, easier debugging, prevents silent success
- **Cons**: Transaction fails (but this is correct)
- **Effort**: Small
- **Risk**: Low

### Option 2: Add settlement bitmap tracking
```rust
// Track each settled round in bitmap
if craps_position.settled_rounds.contains(round.id) {
    return Err(ProgramError::Custom(ALREADY_SETTLED));
}
craps_position.settled_rounds.insert(round.id);
```
- **Pros**: Explicit per-round tracking
- **Cons**: More storage, complex
- **Effort**: Medium
- **Risk**: Low

## Recommended Action
Implement Option 1 - return error instead of silent success.

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/program/src/settle_craps.rs`
- **Related Components**: Settlement logic
- **Database Changes**: No

## Acceptance Criteria
- [ ] Return error for already-settled rounds
- [ ] Add custom error code for ALREADY_SETTLED
- [ ] Update error handling in frontend
- [ ] Test concurrent settlement attempts

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during security audit
- Concurrency analysis
- Categorized as P2 IMPORTANT

## Notes
Source: Multi-agent code review - Security Sentinel #7
Solana's execution model provides some protection, but explicit error handling is better.
