---
status: ready
priority: p2
issue_id: "006"
tags: [performance, memory, store]
dependencies: []
---

# Unbounded Array Growth in Analytics Store

## Problem Statement
The `recordEpoch()` function appends epochs without any size limit, potentially causing memory issues in long-running sessions.

## Findings
- Location: `src/store/analyticsStore.ts:85-93`
- Sessions and epochs arrays grow indefinitely
- No circular buffer or cleanup mechanism
- gameStore limits roundHistory to 50 items, but analyticsStore doesn't

## Proposed Solutions

### Option 1: Add size limits with circular buffer pattern
- **Pros**: Prevents memory issues, predictable memory usage
- **Cons**: Loses old data (could persist to localStorage if needed)
- **Effort**: Medium
- **Risk**: Low

## Recommended Action
- Add a maximum session/epoch limit (e.g., keep last 1000 epochs per session, last 100 sessions)
- Implement circular buffer pattern or remove old entries when limit is reached

## Technical Details
- **Affected Files**: `src/store/analyticsStore.ts`
- **Related Components**: Analytics tracking, session management
- **Database Changes**: No

## Acceptance Criteria
- [ ] Add MAX_EPOCHS_PER_SESSION constant
- [ ] Add MAX_SESSIONS constant
- [ ] Implement cleanup when limits exceeded
- [ ] Build passes

## Work Log

### 2025-11-26 - Initial Discovery
**By:** Claude Triage System
**Actions:**
- Issue discovered during code review triage
- Categorized as P2 (Medium - Performance/Memory)
- Estimated effort: Medium

## Notes
Source: Triage session on 2025-11-26
