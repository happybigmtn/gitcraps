---
status: ready
priority: p2
issue_id: "005"
tags: [performance, hooks]
dependencies: []
---

# Inefficient Polling Interval Calculation in useBoard

## Problem Statement
The polling interval calculation using `getTimeRemaining()` is called inside the scheduling function, which may be recalculated multiple times during the same interval.

## Findings
- Location: `src/hooks/useBoard.ts:297-346`
- `getTimeRemaining()` called inside scheduling loop
- `maxDeployed` calculation recalculated on every render
- Could be memoized for better performance

## Proposed Solutions

### Option 1: Memoize calculations
- **Pros**: Reduces unnecessary computations
- **Cons**: Minimal complexity increase
- **Effort**: Small
- **Risk**: Low

## Recommended Action
- Memoize `getTimeRemaining()` result before the scheduling loop
- Cache `maxDeployed` calculation using `useMemo`

## Technical Details
- **Affected Files**: `src/hooks/useBoard.ts`
- **Related Components**: Board component, polling logic
- **Database Changes**: No

## Acceptance Criteria
- [ ] Memoize getTimeRemaining result
- [ ] Add useMemo for maxDeployed calculation
- [ ] Build passes
- [ ] Verify polling still works correctly

## Work Log

### 2025-11-26 - Initial Discovery
**By:** Claude Triage System
**Actions:**
- Issue discovered during code review triage
- Categorized as P2 (Medium - Performance)
- Estimated effort: Small

## Notes
Source: Triage session on 2025-11-26
