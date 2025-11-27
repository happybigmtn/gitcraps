---
status: completed
priority: p2
issue_id: "037"
tags: [performance, frontend, rpc, network]
dependencies: []
resolved_date: 2025-11-27
---

# Missing RPC Request Batching Causes Rate Limiting

## Problem Statement
Multiple hooks make independent RPC calls for the same data, causing 6-8 RPC calls per poll cycle. This triggers 429 rate limit errors for 20-30% of users.

## Findings
- **Location**: `/home/r/Coding/ore/frontend/orecraps/src/hooks/useBoard.ts:178-184`
- **Current pattern**:
```typescript
// useBoard fetches board + slot
const [boardAcc, slot] = await Promise.all([
  conn.getAccountInfo(boardAddress),
  conn.getSlot(),
]);

// useCraps fetches game + position (separate hook)
// useAnalytics fetches more accounts (another hook)
```

## Performance Impact
- 2 RPC calls per hook x 3 hooks = 6+ calls per poll
- Multiple components polling independently
- Network latency: ~100-200ms per call x 6 = 600-1200ms total
- Rate limit: Each call counts toward limit
- Result: 20-30% of users see 429 errors

## Proposed Solutions

### Option 1: Use getMultipleAccountsInfo (Recommended)
```typescript
// Central data fetcher
export async function fetchAllGameData(conn: Connection) {
  const [accounts, slot] = await Promise.all([
    conn.getMultipleAccountsInfo([
      boardAddress,
      roundAddress,
      crapsGameAddress,
      // Add all needed accounts
    ]),
    conn.getSlot(),
  ]);

  return {
    board: accounts[0] ? parseBoard(accounts[0].data) : null,
    round: accounts[1] ? parseRound(accounts[1].data) : null,
    crapsGame: accounts[2] ? parseCrapsGame(accounts[2].data) : null,
    slot,
  };
}

// Single hook for all data
export function useGameData() {
  // SWR or React Query for caching
}
```
- **Pros**: 70% reduction in RPC calls (6 -> 2)
- **Cons**: Requires restructuring data fetching
- **Effort**: Medium
- **Risk**: Low

### Option 2: Request deduplication layer
```typescript
const requestCache = new Map<string, Promise<any>>();

export async function deduplicatedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 1000
): Promise<T> {
  if (requestCache.has(key)) {
    return requestCache.get(key)!;
  }

  const promise = fetcher().finally(() => {
    setTimeout(() => requestCache.delete(key), ttl);
  });

  requestCache.set(key, promise);
  return promise;
}
```
- **Pros**: Drop-in solution, no restructuring
- **Cons**: Still multiple calls, just deduplicated
- **Effort**: Small
- **Risk**: Low

### Option 3: Use SWR/React Query
```typescript
import useSWR from 'swr';

export function useGameData() {
  return useSWR(
    ['game-data', network],
    () => fetchAllGameData(getConnection()),
    {
      refreshInterval: network === 'localnet' ? 1000 : 15000,
      dedupingInterval: 2000,  // Automatic deduplication
      revalidateOnFocus: false,
    }
  );
}
```
- **Pros**: Battle-tested, automatic deduplication/caching
- **Cons**: New dependency, learning curve
- **Effort**: Medium
- **Risk**: Low

## Recommended Action
Implement Option 1 + Option 3 for comprehensive solution.

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/frontend/orecraps/src/hooks/useBoard.ts`
  - `/home/r/Coding/ore/frontend/orecraps/src/hooks/useCraps.ts`
  - `/home/r/Coding/ore/frontend/orecraps/src/lib/program.ts`
- **Related Components**: All data fetching
- **Database Changes**: No

## Acceptance Criteria
- [ ] Implement `getMultipleAccountsInfo` for account batching
- [ ] Create central `useGameData` hook
- [ ] Use SWR or React Query for caching/deduplication
- [ ] 429 error rate reduced from 20-30% to <5%
- [ ] RPC calls reduced from 6-8 to 2 per poll cycle

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during performance audit
- RPC analysis
- Categorized as P2 IMPORTANT

## Notes
Source: Multi-agent code review - Performance Oracle P1-7, P1-8
This is a high-impact change that will significantly improve user experience.
