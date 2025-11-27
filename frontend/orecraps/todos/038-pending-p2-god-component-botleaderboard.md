---
status: pending
priority: p2
issue_id: "038"
tags: [architecture, frontend, refactoring]
dependencies: []
---

# God Component: BotLeaderboard (713 Lines)

## Problem Statement
BotLeaderboard is a 713-line "God component" that handles too many responsibilities: API calls, state management, continuous simulation, UI rendering, WebSocket-like polling, analytics recording, and more.

## Findings
- **Location**: `/home/r/Coding/ore/frontend/orecraps/src/components/simulation/BotLeaderboard.tsx`
- **Size**: 713 lines (largest frontend component)
- **24+ React hooks** used
- **Responsibilities identified**:
  1. Bot simulation control
  2. Round resolution logic
  3. Epoch management
  4. Analytics recording
  5. Transaction handling
  6. Continuous mode auto-restart
  7. UI rendering
  8. Error handling
  9. State synchronization

## Impact
- Extremely difficult to test
- High cognitive load for developers
- Prone to bugs from complex state interactions
- Violates Single Responsibility Principle

## Proposed Solutions

### Option 1: Extract custom hooks (Recommended)
```typescript
// useSimulationEngine.ts - Core simulation logic
export function useSimulationEngine() {
  // All simulation state and logic
  return { startEpoch, stopSimulation, recordResult };
}

// useContinuousMode.ts - Auto-restart logic
export function useContinuousMode() {
  // Continuous mode state and scheduling
  return { enableContinuous, targetEpochs, progress };
}

// useTransactionManager.ts - Transaction handling
export function useTransactionManager() {
  // Loading states, error handling, retry logic
  return { submit, loading, error };
}
```
- **Pros**: Reusable, testable, clear separation
- **Cons**: Requires careful dependency management
- **Effort**: Medium
- **Risk**: Low

### Option 2: Split into sub-components
```typescript
// BotSimulationController.tsx - Epoch/round logic
// BotLeaderboardDisplay.tsx - Pure UI component
// BotStatistics.tsx - Analytics display
// ContinuousModeControls.tsx - UI controls
// EpochProgress.tsx - Progress indicators
```
- **Pros**: Clear component boundaries
- **Cons**: May need prop drilling or context
- **Effort**: Medium
- **Risk**: Low

### Option 3: Move simulation to store
```typescript
// simulationStore.ts additions
startSimulatedEpoch: async () => {
  // All simulation logic in store
  // Component just calls this and renders state
}
```
- **Pros**: Component becomes thin presentation layer
- **Cons**: Store gets larger
- **Effort**: Large
- **Risk**: Medium

## Recommended Action
Implement Option 1 + Option 2: Extract hooks first, then split components.

## Target Structure
```
components/simulation/
├── BotLeaderboard.tsx (main container, ~150 lines)
├── BotLeaderboardDisplay.tsx (UI, ~200 lines)
├── ContinuousModeControls.tsx (~80 lines)
├── EpochProgress.tsx (~60 lines)
└── hooks/
    ├── useSimulationEngine.ts (~150 lines)
    ├── useContinuousMode.ts (~80 lines)
    └── useEpochRecording.ts (~60 lines)
```

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/frontend/orecraps/src/components/simulation/BotLeaderboard.tsx`
- **New Files**: 5+ new component/hook files
- **Related Components**: simulationStore
- **Database Changes**: No

## Acceptance Criteria
- [ ] Main component reduced to <200 lines
- [ ] Each sub-component has single responsibility
- [ ] Custom hooks are reusable and testable
- [ ] All existing functionality preserved
- [ ] Unit tests for extracted hooks
- [ ] No performance regression

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during architecture + pattern analysis
- Identified 9 distinct responsibilities
- Categorized as P2 IMPORTANT

## Notes
Source: Multi-agent code review - Architecture Strategist, Pattern Recognition
Code Simplicity Reviewer estimates 170 LOC reduction (24%) possible.
