---
status: ready
priority: p2
issue_id: "020"
tags: [architecture, coupling, hooks]
dependencies: []
---

# Tight Coupling Between Components and Hooks

## Problem Statement
Components directly import and call multiple hooks, making them tightly coupled to data fetching and state management implementation. Testing becomes difficult and refactoring hooks requires updating many component files.

## Findings
- Most components import hooks directly (useBoard, useCraps, useCrapsStore, etc.)
- Components know about data fetching implementation details
- Hard to test components in isolation
- Hook refactoring has wide blast radius

## Proposed Solutions

### Option 1: Create higher-level composite hooks
- **Pros**: Reduces component coupling, easier testing
- **Cons**: Additional abstraction layer
- **Effort**: Medium
- **Risk**: Low

```typescript
// useGameState() internally uses useBoard() and useCraps()
function useGameState() {
  const { board, round } = useBoard();
  const { game, position } = useCraps();
  return { board, round, game, position };
}
```

## Recommended Action
- Create custom hooks that aggregate related data
- Use composition pattern for higher-level state access
- Makes testing easier with mock hooks

## Technical Details
- **Affected Files**:
  - New composite hooks
  - Components using multiple hooks
- **Related Components**: Most game components
- **Database Changes**: No

## Acceptance Criteria
- [ ] Create composite useGameState hook
- [ ] Update key components to use composite hook
- [ ] Verify testing is easier
- [ ] Build passes

## Work Log

### 2025-11-26 - Initial Discovery
**By:** Claude Triage System
**Actions:**
- Issue discovered during code review triage
- Categorized as P2 (Medium - Architecture)
- Estimated effort: Medium

## Notes
Source: Triage session on 2025-11-26
