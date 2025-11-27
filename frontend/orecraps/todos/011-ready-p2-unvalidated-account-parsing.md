---
status: ready
priority: p2
issue_id: "011"
tags: [data-integrity, validation, parsing]
dependencies: []
---

# Unvalidated Account Data Parsing in useBoard

## Problem Statement
Account data parsing in useBoard doesn't validate that array reads stay within bounds. If on-chain data structure changes unexpectedly, parsing could read garbage.

## Findings
- Location: `src/hooks/useBoard.ts:193-265`
- parseCrapsGame() and parseCrapsPosition() in program.ts do validate minimum sizes
- useBoard parsing doesn't validate each offset is within bounds
- Unexpected data structure changes could cause silent corruption

## Proposed Solutions

### Option 1: Add bounds checking and try-catch
- **Pros**: Prevents garbage reads, clear error messages
- **Cons**: Slight performance overhead
- **Effort**: Medium
- **Risk**: Low

## Recommended Action
- Add try-catch around all account data parsing
- Validate each offset is within bounds before reading
- Log warnings when data structure doesn't match expectations

## Technical Details
- **Affected Files**: `src/hooks/useBoard.ts`
- **Related Components**: Board display, round data
- **Database Changes**: No

## Acceptance Criteria
- [ ] Add bounds validation for all offset reads
- [ ] Wrap parsing in try-catch
- [ ] Add warning logs for unexpected data
- [ ] Build passes

## Work Log

### 2025-11-26 - Initial Discovery
**By:** Claude Triage System
**Actions:**
- Issue discovered during code review triage
- Categorized as P2 (High - Data Integrity)
- Estimated effort: Medium

## Notes
Source: Triage session on 2025-11-26
