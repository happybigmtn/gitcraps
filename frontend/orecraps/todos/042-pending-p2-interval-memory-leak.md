---
status: completed
priority: p2
issue_id: "042"
tags: [performance, frontend, memory-leak]
dependencies: []
resolved_date: 2025-11-27
---

# Interval Memory Leak in RoundTimer Component

## Problem Statement
The RoundTimer component creates new intervals on every `currentSlot` change (which happens every 400ms on Solana), causing interval recreation and potential memory issues.

## Findings
- **Location**: `/home/r/Coding/ore/frontend/orecraps/src/components/stats/RoundTimer.tsx:38-48`
- **Code**:
```typescript
useEffect(() => {
  if (baseTimeRef.current <= 0) return;

  const interval = setInterval(() => {
    const elapsedSinceUpdate = (Date.now() - lastSlotUpdateRef.current) / 1000;
    const estimatedRemaining = Math.max(0, baseTimeRef.current - elapsedSinceUpdate);
    setTimeRemaining(estimatedRemaining);
  }, 100);

  return () => clearInterval(interval);
}, [currentSlot]); // Recreated on every slot change!
```

## Performance Impact
- New interval created every 400-600ms (Solana slot time)
- 10 state updates/sec from timer × child re-renders = 50+ renders/sec
- Timer updates trigger animations, causing layout thrashing

## Proposed Solutions

### Option 1: Remove currentSlot from dependencies (Recommended)
```typescript
// Update refs without recreating interval
useEffect(() => {
  // Update refs when slot changes
  baseTimeRef.current = calculateTimeRemaining(currentSlot);
  lastSlotUpdateRef.current = Date.now();
}, [currentSlot]);

// Separate effect for interval - only created once
useEffect(() => {
  const interval = setInterval(() => {
    if (baseTimeRef.current <= 0) return;

    const elapsedSinceUpdate = (Date.now() - lastSlotUpdateRef.current) / 1000;
    const estimatedRemaining = Math.max(0, baseTimeRef.current - elapsedSinceUpdate);
    setTimeRemaining(estimatedRemaining);
  }, 100);

  return () => clearInterval(interval);
}, []); // Empty deps - created once
```
- **Pros**: Interval created once, refs updated separately
- **Cons**: Two effects instead of one
- **Effort**: Small
- **Risk**: Low

### Option 2: Increase timer interval
```typescript
}, 250); // 250ms instead of 100ms
```
- **Pros**: Simple change, less frequent updates
- **Cons**: Less smooth countdown display
- **Effort**: Small
- **Risk**: Low

### Option 3: Use requestAnimationFrame
```typescript
useEffect(() => {
  let animationId: number;

  const updateTimer = () => {
    const elapsed = (Date.now() - lastSlotUpdateRef.current) / 1000;
    const remaining = Math.max(0, baseTimeRef.current - elapsed);
    setTimeRemaining(remaining);

    if (remaining > 0) {
      animationId = requestAnimationFrame(updateTimer);
    }
  };

  animationId = requestAnimationFrame(updateTimer);
  return () => cancelAnimationFrame(animationId);
}, []);
```
- **Pros**: Syncs with browser repaint, smoother
- **Cons**: More updates than needed
- **Effort**: Small
- **Risk**: Low

## Recommended Action
Implement Option 1 - separate effects for slot updates and interval.

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/frontend/orecraps/src/components/stats/RoundTimer.tsx`
- **Related Components**: All timer displays
- **Database Changes**: No

## Acceptance Criteria
- [ ] Interval only created once on mount
- [ ] Refs updated when currentSlot changes
- [ ] React DevTools confirms single interval
- [ ] 80% reduction in interval recreation

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during performance audit
- Interval lifecycle analysis
- Categorized as P2 IMPORTANT

## Notes
Source: Multi-agent code review - Performance Oracle P1-6
