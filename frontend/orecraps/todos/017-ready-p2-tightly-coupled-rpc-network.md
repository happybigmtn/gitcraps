---
status: ready
priority: p2
issue_id: "017"
tags: [architecture, coupling]
dependencies: []
---

# Tightly Coupled RPC Management and Network Store

## Problem Statement
The network store explicitly calls `setNetworkMode()` when switching networks, creating tight coupling. If rpcManager's API changes, all callers must update.

## Findings
- Location: `src/store/networkStore.ts:6` calls `setNetworkMode()` from rpcManager
- rpcManager doesn't know about the store (one-way dependency)
- Connection pooling logic is separate from network selection logic
- No abstraction layer between store and RPC management

## Proposed Solutions

### Option 1: Create NetworkService abstraction
- **Pros**: Single source of truth, cleaner API
- **Cons**: Requires significant refactoring
- **Effort**: Large
- **Risk**: Medium

### Option 2: Make rpcManager network-agnostic
- **Pros**: Inject network mode as parameter, reduces coupling
- **Cons**: Still requires coordination
- **Effort**: Medium
- **Risk**: Low

## Recommended Action
- Create a single source of truth for network configuration
- Make rpcManager independent - inject network mode as parameter
- Use event system or context to propagate network changes

## Technical Details
- **Affected Files**:
  - `src/store/networkStore.ts`
  - `src/lib/rpcManager.ts`
  - Potentially new service file
- **Related Components**: All network-aware components
- **Database Changes**: No

## Acceptance Criteria
- [ ] Define clear network configuration interface
- [ ] Reduce coupling between store and rpcManager
- [ ] Build passes
- [ ] Network switching still works correctly

## Work Log

### 2025-11-26 - Initial Discovery
**By:** Claude Triage System
**Actions:**
- Issue discovered during code review triage
- Categorized as P2 (Medium - Architecture)
- Estimated effort: Large

## Notes
Source: Triage session on 2025-11-26
