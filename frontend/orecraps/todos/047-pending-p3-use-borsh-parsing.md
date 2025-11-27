---
status: pending
priority: p3
issue_id: "047"
tags: [code-quality, frontend, refactoring]
dependencies: []
---

# Replace Manual Buffer Parsing with Borsh Serialization

## Problem Statement
Account parsing in `lib/program.ts` uses 127 lines of hand-written buffer parsing. Using the Borsh serialization library (standard for Solana) would reduce code, improve type safety, and auto-generate from Rust schemas.

## Findings
- **Location**: `/home/r/Coding/ore/frontend/orecraps/src/lib/program.ts:490-616`
- **Manual parsing pattern**:
```typescript
export function parseCrapsGame(data: Buffer): CrapsGame {
  let offset = 1;
  const epochId = data.readBigUInt64LE(offset); offset += 8;
  const point = data[offset]; offset += 1;
  const isComeOut = data[offset] === 1; offset += 1;
  // ... 40+ more manual reads
}
```

## Issues
- Error-prone manual offset tracking
- Each field read creates a DataView
- Must update parser if on-chain struct changes
- No compile-time validation against Rust schema

## Proposed Solution

### Use Borsh library
```typescript
// lib/schemas.ts
import { deserialize, Schema } from 'borsh';

// Define schema matching Rust struct
class CrapsGame {
  epochId: bigint;
  point: number;
  isComeOut: boolean;
  epochStartRound: bigint;
  houseBankroll: bigint;
  // ... rest of fields

  constructor(fields: Partial<CrapsGame>) {
    Object.assign(this, fields);
  }

  static schema: Schema = {
    struct: {
      epochId: 'u64',
      point: 'u8',
      isComeOut: 'bool',
      epochStartRound: 'u64',
      houseBankroll: 'u64',
      // ... matches Rust exactly
    }
  };
}

// Simple parsing
export function parseCrapsGame(data: Buffer): CrapsGame {
  // Skip discriminator
  const dataWithoutDiscriminator = data.slice(1);
  return deserialize(CrapsGame.schema, CrapsGame, dataWithoutDiscriminator);
}
```

### Alternative: @coral-xyz/borsh
```typescript
import { BorshAccountsCoder } from '@coral-xyz/anchor';

// If using Anchor, even simpler
const coder = new BorshAccountsCoder(idl);
const crapsGame = coder.decode('CrapsGame', data);
```

## Benefits
- Type safety with schema validation
- ~100 LOC reduction
- Auto-validates buffer structure
- Easier to keep in sync with Rust
- Standard Solana pattern

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/frontend/orecraps/src/lib/program.ts`
- **Dependencies**: Add `borsh` or `@coral-xyz/borsh`
- **LOC Reduction**: ~100 lines
- **New Files**: `lib/schemas.ts`

## Acceptance Criteria
- [ ] Borsh library installed
- [ ] Schema defined matching Rust structs
- [ ] parseCrapsGame using Borsh
- [ ] parseCrapsPosition using Borsh
- [ ] parseBoard using Borsh
- [ ] Unit tests with real account data
- [ ] No parsing regression

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered during code simplicity review
- Analyzed parsing patterns
- Categorized as P3 NICE-TO-HAVE

## Notes
Source: Multi-agent code review - Code Simplicity Reviewer, Performance Oracle
This is standard practice for Solana frontends.
