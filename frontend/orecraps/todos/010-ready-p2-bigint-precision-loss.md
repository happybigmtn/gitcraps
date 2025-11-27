---
status: ready
priority: p2
issue_id: "010"
tags: [data-integrity, precision, bigint]
dependencies: []
---

# Potential Precision Loss in BigInt Conversions

## Problem Statement
Code converts large BigInt values to Number in several places, which loses precision for values larger than `Number.MAX_SAFE_INTEGER` (2^53 - 1).

## Findings
- Location: Multiple files using `Number(bigint)` conversions
- Examples:
  - `const minerCount: number = Number(round.count[index])` in page.tsx
  - `Math.max(...boardSquares.map((s) => Number(s.deployed)), 1)`
- Current values may be small, but could cause issues if stake amounts increase

## Proposed Solutions

### Option 1: Keep BigInt throughout, only convert at display
- **Pros**: Preserves precision, handles large values
- **Cons**: Requires refactoring calculations
- **Effort**: Medium
- **Risk**: Medium

### Option 2: Add overflow validation utility
- **Pros**: Catches issues early, minimal code change
- **Cons**: Doesn't prevent the underlying issue
- **Effort**: Small
- **Risk**: Low

## Recommended Action
- Create utility function: `bigintToNumber(value, maxSafeValue)` with overflow checking
- Only convert to Number at display time (in format functions)
- Add validation to catch overflows in critical calculations

## Technical Details
- **Affected Files**: Multiple components and hooks
- **Related Components**: All BigInt-handling code
- **Database Changes**: No

## Acceptance Criteria
- [ ] Create bigintToNumber utility with overflow check
- [ ] Audit all Number(bigint) conversions
- [ ] Add overflow warnings where appropriate
- [ ] Build passes

## Work Log

### 2025-11-26 - Initial Discovery
**By:** Claude Triage System
**Actions:**
- Issue discovered during code review triage
- Categorized as P2 (High - Data Integrity)
- Estimated effort: Medium

## Notes
Source: Triage session on 2025-11-26
