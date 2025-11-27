---
status: completed
priority: p3
issue_id: "046"
tags: [performance, frontend, refactoring]
dependencies: ["037"]
resolved_date: 2025-11-27
---

# Replace Manual Polling with SWR Library

## Problem Statement
The useBoard hook contains 160+ lines of manual polling logic with complex backoff, timeout management, and error handling. SWR (stale-while-revalidate) library handles all of this automatically with battle-tested patterns.

## Findings
- **Location**: `/home/r/Coding/ore/frontend/orecraps/src/hooks/useBoard.ts:135-295`
- **Manual implementations**:
  - Polling intervals
  - Rate limiting backoff
  - Request deduplication (partial)
  - Error retry logic
  - Stale data handling
  - Mount/unmount cleanup

## Current Complexity
```typescript
// 160+ lines of:
useEffect(() => {
  let isMounted = true;
  let timeoutId: NodeJS.Timeout | null = null;
  let errorCount = 0;

  const poll = async () => {
    if (!isMounted) return;
    // ... complex logic
    const nextInterval = calculateNextInterval(errorCount, timeRemaining);
    timeoutId = setTimeout(poll, nextInterval);
  };

  poll();

  return () => {
    isMounted = false;
    if (timeoutId) clearTimeout(timeoutId);
    // ... cleanup
  };
}, [/* many deps */]);
```

## Proposed Solution

### Replace with SWR
```typescript
// hooks/useBoard.ts - simplified with SWR
import useSWR from 'swr';

const fetcher = async () => {
  const conn = getConnection();
  const [boardAcc, roundAcc, slot] = await Promise.all([
    conn.getAccountInfo(getBoardPDA()),
    conn.getAccountInfo(getRoundPDA()),
    conn.getSlot(),
  ]);

  return {
    board: boardAcc ? parseBoard(boardAcc.data) : null,
    round: roundAcc ? parseRound(roundAcc.data) : null,
    slot,
  };
};

export function useBoard() {
  const { network } = useNetworkStore();
  const isLocalnet = network === "localnet";

  const { data, error, isLoading, mutate } = useSWR(
    ['board', network],
    fetcher,
    {
      refreshInterval: isLocalnet ? 1000 : 15000,
      revalidateOnFocus: false,
      shouldRetryOnError: true,
      errorRetryInterval: 10000,
      errorRetryCount: 5,
      dedupingInterval: 2000,
      onErrorRetry: (error, _key, _config, revalidate, { retryCount }) => {
        // Rate limit handling
        if (error.message?.includes('429')) {
          const backoff = Math.min(30000, 5000 * Math.pow(2, retryCount));
          setTimeout(() => revalidate({ retryCount }), backoff);
          return;
        }
        // Default retry
        setTimeout(() => revalidate({ retryCount }), 5000);
      },
    }
  );

  const getTimeRemaining = useCallback(() => {
    if (!data?.round) return null;
    // Simple calculation
    return calculateTimeRemaining(data.round, data.slot);
  }, [data]);

  return {
    board: data?.board ?? null,
    round: data?.round ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    refetch: mutate,
    getTimeRemaining,
  };
}
```

## Benefits
- **Automatic caching**: No manual cache management
- **Request deduplication**: Built-in
- **Retry with backoff**: Configurable
- **Stale-while-revalidate**: Better UX
- **Focus revalidation**: Optional
- **Mutation**: Easy cache invalidation
- **DevTools**: SWR DevTools available

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/frontend/orecraps/src/hooks/useBoard.ts`
  - `/home/r/Coding/ore/frontend/orecraps/src/hooks/useCraps.ts`
- **Dependencies**: Add `swr` package
- **LOC Reduction**: ~120 lines in useBoard alone

## Acceptance Criteria
- [ ] SWR package installed
- [ ] useBoard refactored to use SWR
- [ ] useCraps refactored to use SWR
- [ ] Rate limiting handled via onErrorRetry
- [ ] Polling intervals configurable
- [ ] No functionality regression
- [ ] 429 error rate reduced

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during code simplicity review
- Analyzed polling complexity
- Categorized as P3 NICE-TO-HAVE

## Notes
Source: Multi-agent code review - Code Simplicity Reviewer
Large refactor but high maintainability gain. Consider react-query as alternative.
