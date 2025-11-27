---
status: completed
priority: p2
issue_id: "041"
tags: [code-quality, duplication, frontend]
dependencies: []
resolved_date: 2025-11-27
---

# Debug Logger Pattern Duplicated 9 Times

## Problem Statement
The same debug logging wrapper is copy-pasted across 9 different files, creating maintenance burden and inconsistent debug tagging.

## Findings
- **Files with duplicate debug wrapper**:
  1. `/home/r/Coding/ore/frontend/orecraps/src/hooks/useBoard.ts:10-13`
  2. `/home/r/Coding/ore/frontend/orecraps/src/hooks/useCraps.ts:16-19`
  3. `/home/r/Coding/ore/frontend/orecraps/src/store/networkStore.ts:8-11`
  4. `/home/r/Coding/ore/frontend/orecraps/src/lib/rpcManager.ts:3-6`
  5. `/home/r/Coding/ore/frontend/orecraps/src/components/simulation/BotLeaderboard.tsx:5-10`
  6. Plus 4 more API routes

- **Duplicated pattern**:
```typescript
const debug = (...args: unknown[]) => {
  if (process.env.NODE_ENV === "development") {
    console.log("[ComponentName]", ...args);
  }
};
```

## Impact
- Boilerplate in every file
- Inconsistent namespace formatting
- Hard to add features (log levels, timestamps, file output)

## Proposed Solutions

### Option 1: Shared debug utility (Recommended)
```typescript
// lib/debug.ts
type DebugFn = (...args: unknown[]) => void;

export const createDebugger = (namespace: string): DebugFn => {
  return (...args: unknown[]) => {
    if (process.env.NODE_ENV === "development") {
      const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
      console.log(`[${timestamp}] [${namespace}]`, ...args);
    }
  };
};

// Optional: log levels
export const createLogger = (namespace: string) => ({
  debug: createDebugger(namespace),
  info: (...args: unknown[]) => console.log(`[${namespace}]`, ...args),
  warn: (...args: unknown[]) => console.warn(`[${namespace}]`, ...args),
  error: (...args: unknown[]) => console.error(`[${namespace}]`, ...args),
});
```

**Usage**:
```typescript
// In any file
import { createDebugger } from '@/lib/debug';
const debug = createDebugger('BotLeaderboard');

debug('Starting epoch', epochNumber);
```
- **Pros**: DRY, extensible, consistent formatting
- **Cons**: One-time migration effort
- **Effort**: Small
- **Risk**: Low

### Option 2: Use existing debug library
```bash
npm install debug
```
```typescript
import Debug from 'debug';
const debug = Debug('orecraps:BotLeaderboard');
```
- **Pros**: Battle-tested, browser support, filtering
- **Cons**: New dependency
- **Effort**: Small
- **Risk**: Low

## Recommended Action
Implement Option 1 for simplicity. Consider Option 2 if more advanced features needed.

## Technical Details
- **Affected Files**: 9 files with duplicate debug pattern
- **New Files**: `/home/r/Coding/ore/frontend/orecraps/src/lib/debug.ts`
- **Related Components**: All components with logging
- **Database Changes**: No

## Acceptance Criteria
- [ ] Create lib/debug.ts with createDebugger utility
- [ ] Replace all 9 duplicate patterns with import
- [ ] Consistent namespace naming convention
- [ ] Optional: Add log levels (debug, info, warn, error)
- [ ] Total LOC reduction: ~45 lines (5 lines x 9 files)

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during pattern recognition audit
- Identified 9 duplicate implementations
- Categorized as P2 IMPORTANT

## Notes
Source: Multi-agent code review - Pattern Recognition
Quick win with immediate maintainability improvement.
