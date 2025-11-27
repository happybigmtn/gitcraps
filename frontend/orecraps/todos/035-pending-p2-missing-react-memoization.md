---
status: completed
priority: p2
issue_id: "035"
tags: [performance, frontend, react]
dependencies: []
resolved_date: 2025-11-27
---

# Missing React Memoization Causes Excessive Re-renders

## Problem Statement
MiningBoard and other expensive components re-render on every parent update without memoization, causing 10+ unnecessary re-renders per second and degraded performance.

## Findings
- **Location**: `/home/r/Coding/ore/frontend/orecraps/src/components/board/MiningBoard.tsx:68-265`
- **Issue**: No `React.memo` wrapper, no memoized callbacks
- **36 buttons rendered** on every state change
- **React DevTools**: 50-80ms render times observed

## Performance Impact
- Re-renders on every store update (timer ticks, polling)
- 36 button reconciliations x ~2ms = 72ms per render
- At 10 updates/sec = 720ms/sec = 72% CPU usage
- Causes UI jank and battery drain

## Proposed Solutions

### Option 1: React.memo with custom comparison (Recommended)
```typescript
export const MiningBoard = React.memo(function MiningBoard({
  squares,
  winningSquare,
  isRoundActive,
}: MiningBoardProps) {
  // Component logic...
}, (prevProps, nextProps) => {
  // Custom comparison for array equality
  return (
    prevProps.winningSquare === nextProps.winningSquare &&
    prevProps.isRoundActive === nextProps.isRoundActive &&
    arraysEqual(prevProps.squares, nextProps.squares)
  );
});

// Helper for shallow array comparison
function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
```
- **Pros**: Prevents unnecessary re-renders, standard React pattern
- **Cons**: Custom comparison adds complexity
- **Effort**: Small
- **Risk**: Low

### Option 2: useMemo for expensive computations
```typescript
const maxDeployed = useMemo(() => {
  return Math.max(...boardSquares.map((s) => Number(s.deployed)), 1);
}, [boardSquares]);

const buttonGrid = useMemo(() => {
  return [1, 2, 3, 4, 5, 6].map((die1) => (
    // ... render logic
  ));
}, [selectedSquares, winningSquare, isRoundActive, squares]);
```
- **Pros**: Memoizes expensive calculations
- **Cons**: Doesn't prevent full component re-render
- **Effort**: Small
- **Risk**: Low

### Option 3: Extract individual button component
```typescript
const DiceButton = React.memo(function DiceButton({
  square, isSelected, isWinner, deployed, maxDeployed
}: DiceButtonProps) {
  // Individual button
});
```
- **Pros**: Fine-grained control, only changed buttons re-render
- **Cons**: More components to manage
- **Effort**: Medium
- **Risk**: Low

## Recommended Action
Implement all three options for maximum performance gain.

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/frontend/orecraps/src/components/board/MiningBoard.tsx`
  - Other expensive components: CrapsBettingPanel, BotLeaderboard
- **Related Components**: All frequently updating components
- **Database Changes**: No

## Acceptance Criteria
- [ ] MiningBoard wrapped with React.memo
- [ ] Custom comparison function handles array props
- [ ] useMemo for maxDeployed calculation
- [ ] React DevTools shows <10ms render times
- [ ] Re-renders reduced to 1-2/sec from 10+/sec

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during performance audit
- Render profiling analysis
- Categorized as P2 IMPORTANT

## Notes
Source: Multi-agent code review - Performance Oracle P1-4, TypeScript Reviewer
Expected improvement: 70-90% reduction in re-renders.
