---
status: ready
priority: p2
issue_id: "018"
tags: [architecture, state-management]
dependencies: []
---

# State Management Fragmentation

## Problem Statement
Five separate Zustand stores exist with overlapping concerns, causing confusion about which store is source of truth for which data.

## Findings
- `gameStore` and `simulationStore` both track game state
- `crapsStore` has redundant game/position state from fetched data
- `analyticsStore` and `simulationStore` both track epochs
- No clear data flow between stores
- Stores: gameStore, crapsStore, networkStore, simulationStore, analyticsStore

## Proposed Solutions

### Option 1: Consolidate stores by concern
- **Pros**: Clear ownership, reduced confusion
- **Cons**: Significant refactoring required
- **Effort**: Large
- **Risk**: Medium

### Option 2: Document data flow and ownership
- **Pros**: Minimal code changes, immediate clarity
- **Cons**: Doesn't fix the underlying issue
- **Effort**: Small
- **Risk**: Low

## Recommended Action
- Make a clear distinction: UI state vs derived state vs on-chain state
- Create store composition/hierarchy
- Document data flow between stores in comments
- Consider consolidating overlapping stores

## Technical Details
- **Affected Files**: All store files
- **Related Components**: All components using stores
- **Database Changes**: No

## Acceptance Criteria
- [ ] Document which store owns which data
- [ ] Remove redundant state where possible
- [ ] Clear data flow between stores
- [ ] Build passes

## Work Log

### 2025-11-26 - Initial Discovery
**By:** Claude Triage System
**Actions:**
- Issue discovered during code review triage
- Categorized as P2 (Medium - Architecture)
- Estimated effort: Large

## Notes
Source: Triage session on 2025-11-26
