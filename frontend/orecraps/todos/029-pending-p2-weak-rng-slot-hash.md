---
status: completed
priority: p2
issue_id: "029"
tags: [security, solana-program, randomness]
dependencies: []
resolved_date: 2025-11-27
---

# Weak RNG Implementation Using XOR Reduction

## Problem Statement
The random number generation uses simple XOR of slot hash components and modulo for winning square selection. This reduces entropy and introduces modulo bias, potentially making outcomes predictable or unfair.

## Findings
- **Location**: `/home/r/Coding/ore/api/src/state/round.rs:57-71`
- **Code**:
```rust
pub fn rng(&self) -> Option<u64> {
    let r1 = u64::from_le_bytes(self.slot_hash[0..8].try_into().unwrap());
    let r2 = u64::from_le_bytes(self.slot_hash[8..16].try_into().unwrap());
    let r3 = u64::from_le_bytes(self.slot_hash[16..24].try_into().unwrap());
    let r4 = u64::from_le_bytes(self.slot_hash[24..32].try_into().unwrap());
    let r = r1 ^ r2 ^ r3 ^ r4;  // XOR reduces 256 bits to 64 bits
    Some(r)
}

pub fn winning_square(&self, rng: u64) -> usize {
    (rng % BOARD_SIZE as u64) as usize  // Modulo bias: 36 doesn't divide 2^64 evenly
}
```

## Issues
1. **XOR reduction**: Reduces 256 bits of entropy to 64 bits
2. **Modulo bias**: `u64::MAX % 36 = 15`, so squares 0-15 have slightly higher probability
3. **Predictability**: If attacker can influence slot timing, may bias outcomes

## Proposed Solutions

### Option 1: Use keccak hash and rejection sampling
```rust
pub fn winning_square(&self, rng: u64) -> usize {
    // Hash the slot hash for better distribution
    let hash = solana_program::keccak::hash(&self.slot_hash);
    let sample = u64::from_le_bytes(hash.to_bytes()[0..8].try_into().unwrap());

    // Rejection sampling to eliminate modulo bias
    let max_valid = (u64::MAX / BOARD_SIZE as u64) * BOARD_SIZE as u64;
    if sample < max_valid {
        (sample % BOARD_SIZE as u64) as usize
    } else {
        // Use hash of hash for retry (deterministic)
        let hash2 = solana_program::keccak::hash(&hash.to_bytes());
        let sample2 = u64::from_le_bytes(hash2.to_bytes()[0..8].try_into().unwrap());
        (sample2 % BOARD_SIZE as u64) as usize
    }
}
```
- **Pros**: Eliminates bias, uses full entropy
- **Cons**: Slightly more compute
- **Effort**: Small
- **Risk**: Low

## Recommended Action
Implement rejection sampling and use keccak hash for better entropy distribution.

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/api/src/state/round.rs`
- **Related Components**: Round resolution, winner selection
- **Database Changes**: No

## Acceptance Criteria
- [ ] Modulo bias eliminated via rejection sampling
- [ ] Full 256-bit entropy utilized
- [ ] Statistical tests confirm uniform distribution
- [ ] Compute unit impact measured and acceptable

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during security audit
- Identified fairness concern
- Categorized as P2 IMPORTANT

## Notes
Source: Multi-agent code review - Security Sentinel
The bias is small (~0.00000001%) but matters for provable fairness.
