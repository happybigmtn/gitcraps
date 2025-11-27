---
status: completed
priority: p1
issue_id: "012"
tags: [code-quality, security, rng]
dependencies: []
---

# Cryptographically Unsafe Random Number Generation

## Problem Statement
All random number generation uses `Math.random()`, which is not cryptographically secure and is predictable. This is critical for a gaming application where unpredictability is essential.

## Findings
- Locations:
  - `src/app/api/start-round/route.ts:22-29`
  - `src/app/page.tsx:31-32`
  - `src/components/dice/DiceAnimation.tsx`
  - `src/components/simulation/BotLeaderboard.tsx`
- Math.random() is predictable with enough observations
- Attacker could potentially predict dice rolls

## Proposed Solutions

### Option 1: Use crypto.getRandomValues() for game mechanics
- **Pros**: Cryptographically secure, unpredictable
- **Cons**: Slight API difference
- **Effort**: Small
- **Risk**: Low

```typescript
function secureRandomDice(): { die1: number; die2: number } {
  const array = new Uint32Array(2);
  crypto.getRandomValues(array);
  return {
    die1: (array[0] % 6) + 1,
    die2: (array[1] % 6) + 1,
  };
}
```

## Recommended Action
- For development/simulation: Keep Math.random() (fine for UI animations)
- For real game mechanics: Use `crypto.getRandomValues()`

## Technical Details
- **Affected Files**:
  - `src/app/api/start-round/route.ts`
  - `src/app/page.tsx`
  - `src/components/dice/DiceAnimation.tsx`
  - `src/components/simulation/BotLeaderboard.tsx`
- **Related Components**: Game logic, dice rolling
- **Database Changes**: No

## Acceptance Criteria
- [ ] Create secureRandom utility function
- [ ] Replace Math.random() in game-critical code
- [ ] Keep Math.random() for animations only
- [ ] Build passes

## Work Log

### 2025-11-26 - Initial Discovery
**By:** Claude Triage System
**Actions:**
- Issue discovered during code review triage
- Categorized as P1 (Critical for production)
- Estimated effort: Small

## Notes
Source: Triage session on 2025-11-26
Note: For true randomness in production, the on-chain VRF should be the source of truth.
