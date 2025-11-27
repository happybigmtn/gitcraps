---
status: completed
priority: p1
issue_id: "001"
tags: [security, command-injection, api]
dependencies: []
---

# Unsafe Shell Command Execution in start-round API

## Problem Statement
The start-round API route uses `exec()` with template string interpolation to construct CLI commands, creating a potential command injection vulnerability.

## Findings
- Location: `src/app/api/start-round/route.ts:68`
- The command string interpolates `KEYPAIR_PATH` and `CLI_PATH` which could be vulnerable if these values come from untrusted sources
- The `RPC` endpoint is interpolated directly with quotes, but quote escaping is not validated
- `reset-round` already uses the safer `spawn()` approach

## Proposed Solutions

### Option 1: Replace exec() with spawn()
- **Pros**: Completely prevents shell injection since arguments are passed directly without shell parsing
- **Cons**: Slight code restructure required
- **Effort**: Small
- **Risk**: Low

## Recommended Action
Use `spawnSync` or `spawn` with array arguments instead of `exec`, matching the pattern already used in reset-round.

## Technical Details
- **Affected Files**: `src/app/api/start-round/route.ts`
- **Related Components**: CLI execution, environment variables
- **Database Changes**: No

## Resources
- Original finding: Code review triage session
- Related: reset-round already uses safe spawn pattern

## Acceptance Criteria
- [ ] Replace exec() with spawn() using array arguments
- [ ] Verify CLI still works correctly
- [ ] Build passes
- [ ] Manual test of start-round API

## Work Log

### 2025-11-26 - Initial Discovery
**By:** Claude Triage System
**Actions:**
- Issue discovered during code review triage
- Categorized as P1 (Critical Security)
- Estimated effort: Small

## Notes
Source: Triage session on 2025-11-26
