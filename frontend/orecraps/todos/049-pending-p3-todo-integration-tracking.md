---
status: pending
priority: p3
issue_id: "049"
tags: [code-quality, rust, documentation]
dependencies: []
---

# Address Active TODO Comments in Codebase

## Problem Statement
There are 4+ active TODO comments in the Rust codebase marking incomplete functionality. These should be addressed or converted to tracked issues.

## Findings
- **TODOs found**:
  1. `/home/r/Coding/ore/program/src/reset.rs:7`: `// TODO Integrate admin fee`
  2. `/home/r/Coding/ore/program/src/reset.rs:229`: `// TODO Safety checks here (if no one won).`
  3. `/home/r/Coding/ore/program/src/deploy.rs:16`: `// TODO Need config account...`
  4. `/home/r/Coding/ore/program/src/checkpoint.rs:6`: `// TODO Integrate admin fee`

## Impact
- Technical debt not tracked
- Incomplete features in production
- No visibility into missing functionality

## Proposed Solution

### For each TODO:

**1. Admin fee integration (reset.rs:7, checkpoint.rs:6)**
- Decide if admin fee is needed
- If yes: Create issue to implement
- If no: Remove TODO

**2. Top miner safety checks (reset.rs:229)**
- This is CRITICAL - validates top miner rewards
- Code is commented out
- Must be implemented before production (related to issue #028)

**3. Config account (deploy.rs:16)**
- Clarify what config is needed
- Implement or remove TODO

### Update TODO format
```rust
// TODO(#123): Integrate admin fee
// Instead of just: // TODO Integrate admin fee
```

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/program/src/reset.rs`
  - `/home/r/Coding/ore/program/src/deploy.rs`
  - `/home/r/Coding/ore/program/src/checkpoint.rs`
- **Related Components**: Fee collection, reward distribution
- **Database Changes**: Possibly (if config account added)

## Acceptance Criteria
- [ ] Each TODO reviewed and decision made
- [ ] Remaining TODOs linked to issues (format: `// TODO(#xxx)`)
- [ ] reset.rs:229 safety checks implemented (see #028)
- [ ] Admin fee decision documented
- [ ] No orphan TODOs without issue references

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during pattern recognition audit
- Identified 4 active TODOs
- Categorized as P3 NICE-TO-HAVE

## Notes
Source: Multi-agent code review - Pattern Recognition
The reset.rs:229 TODO is more critical than P3 - see related issue #028.
