---
status: ready
priority: p2
issue_id: "003"
tags: [security, configuration, api]
dependencies: []
---

# Hardcoded Development Keypair Path

## Problem Statement
All API routes hardcode `/home/r/.config/solana/id.json` as the fallback keypair path, which assumes a specific development environment structure and won't work in production.

## Findings
- Location: Multiple API routes (start-round, reset-round, faucet, localnet)
- User-specific path assumes r's home directory
- Silent failure if file doesn't exist or has incorrect permissions
- No validation that keypair file is readable

## Proposed Solutions

### Option 1: Require environment variable, validate on startup
- **Pros**: Clear configuration, fails fast with explicit error
- **Cons**: Requires env setup in all environments
- **Effort**: Medium
- **Risk**: Low

## Recommended Action
- Use `ADMIN_KEYPAIR_PATH` environment variable exclusively
- Validate the keypair file exists and is readable on startup
- Return explicit error if not configured

## Technical Details
- **Affected Files**:
  - `src/app/api/start-round/route.ts`
  - `src/app/api/reset-round/route.ts`
  - `src/app/api/faucet/route.ts`
  - `src/app/api/localnet/route.ts`
- **Related Components**: Environment configuration
- **Database Changes**: No

## Acceptance Criteria
- [ ] Remove hardcoded fallback path
- [ ] Add startup validation for keypair file
- [ ] Return explicit error when not configured
- [ ] Update .env.example with required variable

## Work Log

### 2025-11-26 - Initial Discovery
**By:** Claude Triage System
**Actions:**
- Issue discovered during code review triage
- Categorized as P2 (High - Security/Configuration)
- Estimated effort: Medium

## Notes
Source: Triage session on 2025-11-26
