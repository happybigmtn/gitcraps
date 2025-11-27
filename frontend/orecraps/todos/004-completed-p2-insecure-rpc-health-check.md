---
status: completed
priority: p2
issue_id: "004"
tags: [security, validation, api]
dependencies: []
---

# Missing Input Validation in RPC Health Checks

## Problem Statement
The localnet health check fetches from RPC without timeout validation or response size limits, potentially causing memory exhaustion or hanging.

## Findings
- Location: `src/app/api/localnet/route.ts:31-59`
- No fetch timeout (pgrep has 5000ms, but fetch calls don't)
- No response size validation
- Could hang indefinitely or consume excessive memory

## Proposed Solutions

### Option 1: Add timeout and size limits to fetch calls
- **Pros**: Prevents resource exhaustion, fail-safe behavior
- **Cons**: Slightly more complex code
- **Effort**: Small
- **Risk**: Low

## Recommended Action
- Add explicit timeout to fetch calls using AbortController
- Validate response size before parsing
- Add maximum allowed response body limit

## Technical Details
- **Affected Files**: `src/app/api/localnet/route.ts`
- **Related Components**: RPC health checking
- **Database Changes**: No

## Acceptance Criteria
- [ ] Add AbortController timeout to fetch calls
- [ ] Limit response body size
- [ ] Build passes

## Work Log

### 2025-11-26 - Initial Discovery
**By:** Claude Triage System
**Actions:**
- Issue discovered during code review triage
- Categorized as P2 (Medium - Security)
- Estimated effort: Small

## Notes
Source: Triage session on 2025-11-26
