---
status: completed
priority: p2
issue_id: "043"
tags: [architecture, frontend, state-management]
dependencies: []
resolved_date: 2025-11-27
---

# State Management Fragmentation Across 5 Zustand Stores

## Problem Statement
Frontend state is fragmented across 5 separate Zustand stores (game, craps, simulation, analytics, network), causing coupling issues, duplicate state, and difficulty understanding data flow.

## Findings
- **Stores identified**:
  1. `gameStore.ts` - Mining game state, round history
  2. `crapsStore.ts` - Craps betting state
  3. `simulationStore.ts` - Bot simulation state
  4. `analyticsStore.ts` - Analytics data
  5. `networkStore.ts` - Network/RPC state

- **Issues observed**:
  - Loading states duplicated (`isLoading`, `isDeploying`)
  - Network state accessed from multiple stores
  - Some state could be derived instead of stored
  - Components need to subscribe to multiple stores

## Impact
- Hard to trace data flow
- Duplicate state management
- Complex component subscriptions
- Potential for state inconsistencies

## Proposed Solutions

### Option 1: Consolidate into domain stores (Recommended)
```typescript
// Consolidate to 3 stores:
// 1. chainStore.ts - All on-chain state (board, round, craps game, positions)
// 2. uiStore.ts - UI state (loading, errors, selections, network)
// 3. simulationStore.ts - Bot simulation (keep separate, complex)

// chainStore.ts
interface ChainStore {
  // Board state
  board: Board | null;
  round: Round | null;

  // Craps state
  crapsGame: CrapsGame | null;
  crapsPosition: CrapsPosition | null;

  // Unified loading
  isLoading: boolean;
  lastError: string | null;

  // Actions
  fetchAllChainState: () => Promise<void>;
  reset: () => void;
}

// uiStore.ts
interface UIStore {
  // Selections
  selectedSquares: boolean[];
  deployAmount: number;
  betAmount: number;

  // Network
  network: NetworkType;
  rpcEndpoint: string;

  // UI state
  isDeploying: boolean;
  pendingBets: PendingBet[];
}
```
- **Pros**: Clear domain boundaries, reduced duplication
- **Cons**: Migration effort
- **Effort**: Medium
- **Risk**: Medium

### Option 2: Add shared utilities
```typescript
// lib/storeUtils.ts
export interface AsyncState {
  loading: boolean;
  error: string | null;
}

export const createAsyncSlice = <T extends AsyncState>() => ({
  setLoading: (loading: boolean) => set({ loading, error: null }),
  setError: (error: string) => set({ loading: false, error }),
  setSuccess: () => set({ loading: false, error: null }),
});
```
- **Pros**: Consistent patterns without restructuring
- **Cons**: Still fragmented
- **Effort**: Small
- **Risk**: Low

### Option 3: Use single global store with slices
```typescript
// store/index.ts
import { create } from 'zustand';
import { gameSlice } from './slices/game';
import { crapsSlice } from './slices/craps';
import { networkSlice } from './slices/network';

const useStore = create<StoreState>((set, get) => ({
  ...gameSlice(set, get),
  ...crapsSlice(set, get),
  ...networkSlice(set, get),
}));
```
- **Pros**: Single store, slice-based organization
- **Cons**: Large store, harder to split code
- **Effort**: Large
- **Risk**: High

## Recommended Action
Implement Option 2 first (quick wins), plan for Option 1 as larger refactor.

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/frontend/orecraps/src/store/*.ts`
- **Related Components**: All components using stores
- **Database Changes**: No

## Acceptance Criteria
- [ ] Shared async state utilities created
- [ ] Duplicate loading/error states consolidated
- [ ] Clear documentation of store responsibilities
- [ ] Consider migration to domain stores

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during architecture audit
- Store analysis
- Categorized as P2 IMPORTANT

## Notes
Source: Multi-agent code review - Architecture Strategist, TypeScript Reviewer
This is a larger architectural decision - discuss with team before major changes.
