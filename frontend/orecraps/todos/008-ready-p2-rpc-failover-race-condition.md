---
status: ready
priority: p2
issue_id: "008"
tags: [data-integrity, race-condition, rpc]
dependencies: []
---

# Race Condition in RPC Endpoint Failover

## Problem Statement
The RPC manager has a race condition where multiple concurrent calls to `switchToNextEndpoint()` could cause the connection to be recreated multiple times.

## Findings
- Location: `src/lib/rpcManager.ts:110-136`
- Multiple concurrent failures could trigger multiple switches
- `reportFailure()` and `reportSuccess()` update refs without synchronization
- No flag to prevent concurrent endpoint switches

## Proposed Solutions

### Option 1: Add synchronization flag
- **Pros**: Prevents concurrent switches, atomic operations
- **Cons**: Slight complexity increase
- **Effort**: Medium
- **Risk**: Low

## Recommended Action
- Use a flag to prevent concurrent endpoint switches
- Ensure all failure/success reports are processed atomically
- Consider using a queue for pending operations during endpoint switches

## Technical Details
- **Affected Files**: `src/lib/rpcManager.ts`
- **Related Components**: All RPC-dependent hooks and components
- **Database Changes**: No

## Acceptance Criteria
- [ ] Add isSwitching flag to prevent concurrent switches
- [ ] Make switchToEndpoint atomic
- [ ] Build passes
- [ ] Verify failover still works under load

## Work Log

### 2025-11-26 - Initial Discovery
**By:** Claude Triage System
**Actions:**
- Issue discovered during code review triage
- Categorized as P2 (High - Data Integrity)
- Estimated effort: Medium

## Notes
Source: Triage session on 2025-11-26
