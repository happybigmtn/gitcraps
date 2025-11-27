---
status: completed
priority: p1
issue_id: "025"
tags: [security, secrets, immediate-action]
dependencies: []
resolved_date: 2025-11-27
---

# Exposed Helius API Key in Repository

## Problem Statement
A production Helius RPC API key is hardcoded in the `.env.local` file which appears to be tracked in git. This key can be used by anyone to make RPC requests, consume rate limits, or incur costs.

## Findings
- **Location**: `/home/r/Coding/ore/frontend/orecraps/.env.local:2`
- **Exposed credential**:
```
NEXT_PUBLIC_RPC_ENDPOINT=https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7
```
- **Key**: `22043299-7cbe-491c-995a-2e216e3a7cc7`

## Impact
- Rate limit exhaustion (DoS via quota consumption)
- Potential billing costs if on paid tier
- Information disclosure about infrastructure
- Key needs immediate rotation

## Proposed Solutions

### Option 1: Immediate key rotation and gitignore (Recommended)
1. **TODAY**: Revoke key in Helius dashboard
2. Generate new API key
3. Add `.env.local` to `.gitignore`
4. Remove from git history with BFG or filter-branch
5. Use runtime environment injection

```bash
# .gitignore additions
.env.local
.env*.local
.env.production.local
.env.development.local
*.key
*.pem
```

```bash
# .env.example (safe to commit)
NEXT_PUBLIC_RPC_ENDPOINT=https://devnet.helius-rpc.com/?api-key=YOUR_KEY_HERE
```
- **Pros**: Complete remediation
- **Cons**: Requires key rotation coordination
- **Effort**: Small
- **Risk**: Low

## Recommended Action
IMMEDIATE: Rotate the API key today. Add gitignore rules.

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/frontend/orecraps/.env.local`
  - `/home/r/Coding/ore/.gitignore`
- **Related Components**: All RPC calls
- **Database Changes**: No

## Resources
- Security Sentinel finding #3
- Git history analyzer recommendation
- Helius API key management docs

## Acceptance Criteria
- [ ] Old API key `22043299-7cbe-491c-995a-2e216e3a7cc7` revoked
- [ ] New API key generated and stored securely
- [ ] `.env.local` added to `.gitignore`
- [ ] `.env.example` created with placeholder
- [ ] Git history purged of exposed key (optional but recommended)
- [ ] Documentation updated for deployment

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered exposed API key during security audit
- Flagged for immediate action
- Categorized as P1 CRITICAL - credential exposure

## Notes
Source: Multi-agent code review - Security Sentinel
ACTION REQUIRED TODAY - Do not delay key rotation.
