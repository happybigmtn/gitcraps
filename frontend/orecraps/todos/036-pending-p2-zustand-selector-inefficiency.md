---
status: completed
priority: p2
issue_id: "036"
tags: [performance, frontend, zustand]
dependencies: []
resolved_date: 2025-11-27
---

# Inefficient Zustand Selectors Cause Unnecessary Recomputation

## Problem Statement
Derived selectors in Zustand stores recompute on every state change, not just when relevant fields change. Missing shallow comparison causes excessive re-renders.

## Findings
- **Location**: `/home/r/Coding/ore/frontend/orecraps/src/store/crapsStore.ts:203-312`
- **Example problematic selector**:
```typescript
// Recomputes on ANY state change
export const useCanPlaceBet = (betType: CrapsBetType, point?: number) =>
  useCrapsStore((state) => {
    const game = state.crapsGame;
    const position = state.crapsPosition;
    // Complex validation logic runs on EVERY state update
    // ...
  });
```

## Performance Impact
- Executes on every Zustand update (bet amounts, loading states)
- Complex validation logic: ~1-2ms per execution
- With 5+ components using it: 5-10ms per store update
- At 10 updates/sec: 50-100ms/sec wasted

## Proposed Solutions

### Option 1: Use shallow equality comparison (Recommended)
```typescript
import { shallow } from 'zustand/shallow';

export const useCanPlaceBet = (betType: CrapsBetType, point?: number) =>
  useCrapsStore(
    (state) => ({
      canBet: canPlaceBetLogic(state.crapsGame, state.crapsPosition, betType, point),
      reason: getReasonLogic(state.crapsGame, state.crapsPosition, betType, point),
    }),
    shallow  // Prevents re-render if output object values unchanged
  );
```
- **Pros**: Standard Zustand optimization, minimal change
- **Cons**: Requires returning object, shallow comparison
- **Effort**: Small
- **Risk**: Low

### Option 2: Fine-grained selectors
```typescript
// Separate selectors for each piece of state
export const useGamePhase = () =>
  useCrapsStore(state => state.crapsGame?.isComeOut ? "come-out" : "point");

export const usePointValue = () =>
  useCrapsStore(state => state.crapsGame?.point ?? 0);

// Combine only what's needed
function BetButton({ betType }: { betType: CrapsBetType }) {
  const phase = useGamePhase();
  const point = usePointValue();
  // Only re-renders when phase or point changes
}
```
- **Pros**: Maximum granularity
- **Cons**: More selectors to manage
- **Effort**: Medium
- **Risk**: Low

### Option 3: Extract validation to pure functions
```typescript
// lib/crapsValidation.ts
export function canPlaceBet(
  game: CrapsGame | null,
  position: CrapsPosition | null,
  betType: CrapsBetType,
  point?: number
): { canBet: boolean; reason?: string } {
  // Pure function, testable, reusable
}

// In component - useMemo to memoize result
const { canBet, reason } = useMemo(
  () => canPlaceBet(game, position, betType, point),
  [game?.epochId, position?.epochId, betType, point]  // Only relevant deps
);
```
- **Pros**: Testable, clear dependencies
- **Cons**: Manual dependency tracking
- **Effort**: Medium
- **Risk**: Low

## Recommended Action
Implement Option 1 first (quick win), then Option 3 for complex selectors.

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/frontend/orecraps/src/store/crapsStore.ts`
  - `/home/r/Coding/ore/frontend/orecraps/src/store/gameStore.ts`
  - `/home/r/Coding/ore/frontend/orecraps/src/store/simulationStore.ts`
- **Related Components**: All components using store selectors
- **Database Changes**: No

## Acceptance Criteria
- [ ] Import and use `shallow` from 'zustand/shallow'
- [ ] Complex selectors return objects with shallow comparison
- [ ] React DevTools confirms reduced re-renders
- [ ] Extract validation to pure functions for testability
- [ ] 80-90% reduction in selector executions

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during performance + TypeScript audit
- Selector analysis
- Categorized as P2 IMPORTANT

## Notes
Source: Multi-agent code review - Performance Oracle P1-5, TypeScript Reviewer P1.5
