---
status: completed
priority: p2
issue_id: "040"
tags: [architecture, code-quality, duplication]
dependencies: []
resolved_date: 2025-11-27
---

# Code Duplication: Dice Calculation Logic in 3 Languages

## Problem Statement
The square-to-dice conversion logic is duplicated across Rust (program), Rust (API), and TypeScript (frontend). This creates risk of logic divergence and maintenance burden.

## Findings
- **Rust program**: `/home/r/Coding/ore/program/src/craps_utils.rs:5-15`
- **Rust API**: `/home/r/Coding/ore/api/src/state/craps_position.rs:191-225`
- **TypeScript**: `/home/r/Coding/ore/frontend/orecraps/src/store/simulationStore.ts:91-102`
- **Also in**: `/home/r/Coding/ore/frontend/orecraps/src/lib/program.ts` (similar logic)

### Example of Duplication

**Rust version**:
```rust
pub fn square_to_dice_sum(square: usize) -> u8 {
    let die1 = (square / 6) + 1;
    let die2 = (square % 6) + 1;
    (die1 + die2) as u8
}
```

**TypeScript version**:
```typescript
function squareToSum(square: number): number {
  const die1 = Math.floor(square / 6) + 1;
  const die2 = (square % 6) + 1;
  return die1 + die2;
}
```

## Impact
- If formula changes, must update in 4+ places
- Risk of divergence between frontend and backend
- No single source of truth

## Proposed Solutions

### Option 1: Document and test across languages (Recommended for now)
```markdown
# Dice Calculation Specification

## Square to Dice Mapping
- Board is 6x6 grid (squares 0-35)
- Square = (die1 - 1) * 6 + (die2 - 1)
- die1 = floor(square / 6) + 1
- die2 = (square % 6) + 1
- sum = die1 + die2

## Constants
- BOARD_SIZE = 36
- DICE_FACES = 6
- MIN_SUM = 2, MAX_SUM = 12

## Test Vectors
| Square | Die1 | Die2 | Sum |
|--------|------|------|-----|
| 0      | 1    | 1    | 2   |
| 5      | 1    | 6    | 7   |
| 6      | 2    | 1    | 3   |
| 35     | 6    | 6    | 12  |
```
- **Pros**: Low effort, ensures correctness
- **Cons**: Still duplicate code
- **Effort**: Small
- **Risk**: Low

### Option 2: Code generation from spec
- Define in JSON/YAML
- Generate Rust and TypeScript from single source
- **Effort**: Large
- **Risk**: Medium

### Option 3: Consolidate within each language
```typescript
// frontend: lib/dice.ts (single source)
export const DICE_FACES = 6;
export const BOARD_SIZE = DICE_FACES * DICE_FACES;

export function squareToDice(square: number): [number, number] {
  return [Math.floor(square / DICE_FACES) + 1, (square % DICE_FACES) + 1];
}

export function squareToSum(square: number): number {
  const [d1, d2] = squareToDice(square);
  return d1 + d2;
}

export function diceToSquare(die1: number, die2: number): number {
  return (die1 - 1) * DICE_FACES + (die2 - 1);
}
```
- **Pros**: Single source per language
- **Cons**: Still 2 implementations
- **Effort**: Small
- **Risk**: Low

## Recommended Action
Implement Option 1 (documentation) + Option 3 (consolidate per language).

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/program/src/craps_utils.rs`
  - `/home/r/Coding/ore/api/src/state/craps_position.rs`
  - `/home/r/Coding/ore/frontend/orecraps/src/store/simulationStore.ts`
  - `/home/r/Coding/ore/frontend/orecraps/src/lib/dice.ts`
- **New Files**: Specification document
- **Related Components**: All dice-related logic
- **Database Changes**: No

## Acceptance Criteria
- [ ] Specification document created with test vectors
- [ ] TypeScript consolidated to lib/dice.ts
- [ ] Rust consolidated to craps_utils.rs (remove from craps_position.rs)
- [ ] Cross-language tests verify consistency
- [ ] All duplicate implementations removed

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during pattern recognition audit
- Identified 4+ duplicate implementations
- Categorized as P2 IMPORTANT

## Notes
Source: Multi-agent code review - Pattern Recognition
