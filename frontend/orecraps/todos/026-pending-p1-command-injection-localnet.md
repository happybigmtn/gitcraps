---
status: completed
priority: p1
issue_id: "026"
tags: [security, api, command-injection, critical]
dependencies: []
resolved_date: 2025-11-27
---

# Command Injection via Shell Execution in Localnet API

## Problem Statement
The localnet API route uses `execAsync()` with string interpolation for shell commands. If environment variables are compromised or contain shell metacharacters, arbitrary commands could be executed on the server.

## Findings
- **Location**: `/home/r/Coding/ore/frontend/orecraps/src/app/api/localnet/route.ts`
- **Lines affected**: 110-112, 131-133, 145-147
- **Vulnerable code**:
```typescript
const { stdout, stderr } = await execAsync(
  `KEYPAIR="${KEYPAIR_PATH}" "${SCRIPT_PATH}" start`,
  { timeout: 60000 }
);
```

## Scenario
1. Attacker gains control of environment variable
2. Sets `KEYPAIR_PATH="; rm -rf / #"` or similar
3. Shell interprets metacharacters
4. Arbitrary command execution (RCE)

## Proposed Solutions

### Option 1: Use spawnSync with array arguments (Recommended)
```typescript
import { spawnSync } from "child_process";

const result = spawnSync(SCRIPT_PATH, ['start'], {
  timeout: 60000,
  encoding: 'utf-8',
  env: {
    ...process.env,
    KEYPAIR: KEYPAIR_PATH,
  },
});

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error(`Process exited with code ${result.status}: ${result.stderr}`);
}

return result.stdout;
```
- **Pros**: No shell interpolation, arguments passed as array, safe
- **Cons**: Slightly different API
- **Effort**: Small
- **Risk**: Low

### Option 2: Input sanitization
```typescript
const sanitizedPath = KEYPAIR_PATH.replace(/[;&|`$()]/g, '');
```
- **Pros**: Quick fix
- **Cons**: Blocklist approach, might miss edge cases
- **Effort**: Small
- **Risk**: Medium (incomplete protection)

## Recommended Action
Implement Option 1 - replace all `execAsync` with `spawnSync` array arguments.

## Technical Details
- **Affected Files**:
  - `/home/r/Coding/ore/frontend/orecraps/src/app/api/localnet/route.ts`
- **Related Components**: Localnet management API
- **Database Changes**: No

## Resources
- Security Sentinel finding #4
- OWASP Command Injection Prevention
- Node.js child_process security best practices

## Acceptance Criteria
- [ ] All `execAsync` calls replaced with `spawnSync` using array arguments
- [ ] No string interpolation in shell commands
- [ ] Environment variables passed via `env` option, not shell string
- [ ] Error handling updated for new API
- [ ] Security review of changes

## Work Log

### 2025-11-27 - Initial Discovery
**By:** Claude Code Review System
**Actions:**
- Discovered command injection vectors during security audit
- Identified 3 vulnerable execAsync calls
- Categorized as P1 CRITICAL - potential RCE

## Notes
Source: Multi-agent code review - Security Sentinel
Note: Other API routes (faucet, reset-round, start-round) already use spawnSync correctly.
