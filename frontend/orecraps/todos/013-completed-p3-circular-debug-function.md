---
status: completed
priority: p3
issue_id: "013"
tags: [code-quality, bug]
dependencies: []
---

# Circular Debug Function in BotLeaderboard

## Problem Statement
The debug function in BotLeaderboard calls itself instead of console.log, causing infinite recursion in development mode.

## Findings
- Location: `src/components/simulation/BotLeaderboard.tsx:6-10`
- Self-referential call: `debug("[BotLeaderboard]", ...args)` instead of `console.log`
- Likely a copy-paste error from debug logging pattern
- Will crash in development mode if debug is ever called

## Proposed Solutions

### Option 1: Fix the typo (trivial)
- **Pros**: Immediate fix
- **Cons**: None
- **Effort**: Trivial
- **Risk**: None

```typescript
const debug = (...args: unknown[]) => {
  if (process.env.NODE_ENV === "development") {
    console.log("[BotLeaderboard]", ...args);  // Fix: console.log not debug
  }
};
```

## Recommended Action
Replace `debug("[BotLeaderboard]"` with `console.log("[BotLeaderboard]"` inside the debug function.

## Technical Details
- **Affected Files**: `src/components/simulation/BotLeaderboard.tsx`
- **Related Components**: Simulation display
- **Database Changes**: No

## Acceptance Criteria
- [ ] Fix the recursive call
- [ ] Build passes

## Work Log

### 2025-11-26 - Initial Discovery
**By:** Claude Triage System
**Actions:**
- Issue discovered during code review triage
- Categorized as P3 (Low - Bug but contained)
- Estimated effort: Trivial

## Notes
Source: Triage session on 2025-11-26
