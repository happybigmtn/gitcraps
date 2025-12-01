# ORE Craps - Agent Documentation

## Localnet Initialization Guide

### Prerequisites

1. **Solana CLI** installed and configured
2. **ORE Program** built at `/home/r/Coding/ore/target/deploy/ore.so`
3. **Token mint accounts** in `.localnet-accounts/` directory

### Program IDs

```
ORE Program:  JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK
RNG Token:    RNGqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump
CRAP Token:   CRAPqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump
```

### Step 1: Start Localnet Validator

```bash
cd /home/r/Coding/ore

# Kill any existing validator
killall -9 solana-test-validator 2>/dev/null; sleep 2

# Start fresh validator with ORE program and token mints
rm -rf .localnet-ledger && \
solana-test-validator --reset \
  --bpf-program JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK target/deploy/ore.so \
  --account CRAPqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump .localnet-accounts/crap-mint.json \
  --account RNGqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump .localnet-accounts/rng-mint.json \
  --ledger .localnet-ledger > .localnet-validator.log 2>&1 &

# Wait for validator to start
sleep 10
solana cluster-version -u localhost && echo "Validator ready!"
```

### Step 2: Initialize Program

After the validator is running, initialize the ORE program accounts:

```bash
# Using curl
curl -X POST http://localhost:3000/api/initialize
```

This creates:
- **Board** account - tracks current round ID and global state
- **Config** account - program configuration
- **Treasury** account - holds house funds
- **Round 0** account - first mining round

### Step 3: Start Frontend

```bash
cd /home/r/Coding/ore/frontend/orecraps
npm run dev
```

The frontend runs at http://localhost:3000

---

## API Endpoints Reference

### Program Initialization

#### `POST /api/initialize`
Initialize the ORE program on localnet. Creates Board, Config, Treasury, and Round 0.

**Response:**
```json
{
  "success": true,
  "message": "Program initialized successfully",
  "signature": "...",
  "accounts": {
    "board": "...",
    "config": "...",
    "treasury": "...",
    "round0": "..."
  }
}
```

#### `GET /api/initialize`
Check if program is initialized.

### Round Management

#### `POST /api/start-round`
Start a new mining round.

**Body:**
```json
{
  "duration": 300,
  "network": "localnet",
  "simulated": true
}
```

#### `POST /api/localnet-reset`
Inject RNG into the current round (localnet only). Enables settlement without real mining.

**Body:**
```json
{
  "winningSquare": 7
}
```

**Response:**
```json
{
  "success": true,
  "roundId": "0",
  "winningSquare": 7,
  "diceResults": { "die1": 2, "die2": 6, "sum": 8 }
}
```

### Craps Betting

#### `POST /api/place-bet`
Place craps bets.

**Body:**
```json
{
  "bets": [
    { "betType": 0, "amount": 0.1 },
    { "betType": 1, "amount": 0.2 }
  ]
}
```

**Bet Types:**
- 0: PassLine
- 1: DontPass
- 2: Come
- 3: DontCome
- 4-9: Place bets (4,5,6,8,9,10)
- 10-15: Hardways and Props
- 16-25: Side bets

#### `POST /api/settle-craps`
Settle craps bets after round completes.

**Body:**
```json
{
  "winningSquare": 7,
  "roundId": "0"
}
```

### Delegated Transactions (Session Keys)

#### `POST /api/delegated`
Execute transactions using session key delegation (gasless for users).

**Body:**
```json
{
  "session": {
    "walletAddress": "...",
    "sessionPublicKey": "...",
    "approvalSignature": "...",
    "approvalMessage": "...",
    "expiresAt": 1234567890
  },
  "action": "place-bet",
  "bets": [{ "betType": 0, "amount": 0.1 }]
}
```

**Actions:**
- `place-bet` - Place bets
- `claim-winnings` - Claim pending winnings
- `settle-bets` - Settle round bets

---

## Testing with Playwright and Solflare Web Wallet

### Setup Solflare for Localnet Testing

1. **Install Solflare Extension** from Chrome Web Store
2. **Create/Import Test Wallet** in Solflare
3. **Configure Custom RPC:**
   - Open Solflare Settings > Network
   - Add Custom Network: `http://localhost:8899`
   - Name it "Localnet"

### Fund Test Wallet

```bash
# Airdrop SOL to your test wallet
solana airdrop 10 YOUR_WALLET_ADDRESS -u localhost

# Or use the faucet API
curl -X POST http://localhost:3000/api/faucet \
  -H "Content-Type: application/json" \
  -d '{"wallet": "YOUR_WALLET_ADDRESS"}'
```

### Playwright Test Flow

```javascript
import { test, expect } from '@playwright/test';

test('craps betting flow', async ({ page }) => {
  // 1. Navigate to app
  await page.goto('http://localhost:3000');

  // 2. Connect wallet (Solflare prompt will appear)
  await page.click('[data-testid="connect-wallet"]');

  // 3. Enable Gas-Free Mode (session key)
  await page.click('text=Enable Gas-Free Mode');
  // Sign the session approval in Solflare

  // 4. Place a bet
  await page.click('[data-testid="pass-line-bet"]');
  await page.fill('[data-testid="bet-amount"]', '0.1');
  await page.click('[data-testid="submit-bet"]');

  // 5. Verify bet placed
  await expect(page.locator('[data-testid="active-bets"]')).toContainText('Pass Line');
});
```

### Automated Testing Script

Create a test script to run multiple epochs:

```javascript
// test-all-bets.mjs
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

const RPC = 'http://localhost:8899';
const connection = new Connection(RPC, 'confirmed');

async function runEpochTest() {
  // Initialize if needed
  await fetch('http://localhost:3000/api/initialize', { method: 'POST' });

  // Place bets
  const betResponse = await fetch('http://localhost:3000/api/place-bet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bets: [{ betType: 0, amount: 0.1 }]
    })
  });

  // Inject RNG for testing
  const rngResponse = await fetch('http://localhost:3000/api/localnet-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ winningSquare: 7 })
  });
  const rngResult = await rngResponse.json();

  // Settle bets
  const settleResponse = await fetch('http://localhost:3000/api/settle-craps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      winningSquare: rngResult.winningSquare,
      roundId: rngResult.roundId
    })
  });

  console.log('Epoch complete:', await settleResponse.json());
}

// Run multiple epochs
for (let i = 0; i < 10; i++) {
  await runEpochTest();
  console.log(`Epoch ${i + 1} complete`);
}
```

---

## Environment Configuration

### Required Environment Variables

```env
# Network
NEXT_PUBLIC_SOLANA_NETWORK=localnet

# Admin keypair (base58 encoded)
ADMIN_KEYPAIR=your-base58-encoded-secret-key

# Or file path
ADMIN_KEYPAIR_PATH=/path/to/keypair.json

# For security
ADMIN_API_TOKEN=your-secure-token

# Optional: Entropy seed storage
SEED_STORAGE_DIR=/secure/path/to/seeds
```

### Generate Admin Keypair

```bash
# Create new keypair
solana-keygen new -o admin-keypair.json

# Convert to base58 for env var
cat admin-keypair.json | python3 -c "
import sys,json
ALPHABET='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
b=bytes(json.load(sys.stdin))
n=int.from_bytes(b,'big')
r=''
while n: n,m=divmod(n,58); r=ALPHABET[m]+r
print(ALPHABET[0]*(len(b)-len(b.lstrip(b'\x00')))+r)
"
```

---

## Troubleshooting

### Validator Won't Start
```bash
# Check if port is in use
lsof -i :8899

# Kill stale processes
killall -9 solana-test-validator
```

### "Board not initialized" Error
Program needs initialization after validator restart:
```bash
curl -X POST http://localhost:3000/api/initialize
```

### Transaction Fails with "Insufficient SOL"
Web wallet users need SOL for gas. Options:
1. Use the faucet: `POST /api/faucet`
2. Enable session keys for gasless transactions
3. Airdrop directly: `solana airdrop 10 ADDRESS -u localhost`

### RNG Injection Fails
The localnet validator must support `setAccount` RPC method:
```bash
# Verify validator supports setAccount
curl -X POST http://localhost:8899 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getVersion"}'
```

---

## Session Key System (Gasless Transactions)

### How It Works

1. **User signs approval message** with their wallet
2. **Session data stored in localStorage** for 24 hours
3. **Server pays gas fees** for delegated transactions
4. **User's wallet** remains the authority for on-chain accounts

### Session Flow

```
User Wallet → Sign Approval → Store Session → API Request → Server Signs → On-Chain TX
```

### Security Notes

- Session approval includes wallet address and expiry timestamp
- Server verifies signature matches wallet before executing
- Sessions expire after 24 hours
- Users can end sessions early via UI

---

## Devnet Testing Guide

### Devnet Program Addresses

```
Program ID:      JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK
CRAP Token Mint: 7frAenkamJSASBH9YukkzBsSMz9paQdYuSGw4SjWkXrf
RNG Token Mint:  8HJyJPD4iWD1X9FxZEjDuVpPqSBvNeaJCczXeK2xsShs
CrapsGame PDA:   F4e4avXd1r9J2KSck7vq1srux4X8KYCE2jwTW2x4a4Gi
CrapsVault PDA:  HS2suUEiabC67XyU4FxhogfxkixwYnKxH9eTgLxGnvX8
Board PDA:       FKUBSpmzd2gDdoenmwJRGiZJVcXL5kFD3yeWBYtergMn
```

### Testing with Phantom Wallet on Devnet

#### Step 1: Configure Phantom for Devnet

1. Open Phantom wallet extension
2. Click the gear icon (Settings)
3. Go to "Developer Settings"
4. Enable "Testnet Mode"
5. Select "Devnet" as the network

#### Step 2: Get Devnet SOL

Get free devnet SOL from the Solana faucet:

```bash
# Via Solana CLI
solana airdrop 2 YOUR_PHANTOM_ADDRESS --url devnet

# Or via web faucet
# https://faucet.solana.com
```

#### Step 3: Get CRAP Tokens

The devnet CRAP token is at `7frAenkamJSASBH9YukkzBsSMz9paQdYuSGw4SjWkXrf`.

To mint CRAP tokens (requires mint authority):
```bash
cd /home/r/Coding/ore/frontend/orecraps
node fund-house-devnet.mjs
```

Or transfer CRAP tokens from an existing devnet account.

#### Step 4: Start Frontend in Devnet Mode

Ensure `.env.local` is configured for devnet:

```env
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_RPC_ENDPOINT=https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY
SOLANA_NETWORK=devnet
ADMIN_KEYPAIR_PATH=/path/to/admin-keypair.json
```

Then start the frontend:

```bash
cd /home/r/Coding/ore/frontend/orecraps
npm run dev
```

Navigate to http://localhost:3000 and connect your Phantom wallet.

#### Step 5: Place Bets

1. Connect your Phantom wallet (ensure it's on Devnet)
2. Select bet type (Pass Line, Come, Place bets, etc.)
3. Enter bet amount in CRAP tokens
4. Click "Place Bet" and confirm in Phantom

### Devnet Test Scripts

#### Comprehensive Test (Server-side)

```bash
cd /home/r/Coding/ore/frontend/orecraps
node devnet-comprehensive-test.mjs
```

This tests all 7 bet types with simulation mode.

#### Fund House Treasury

```bash
node fund-house-devnet.mjs
```

This script:
1. Creates admin's CRAP token ATA if needed
2. Mints CRAP tokens to admin (admin must be mint authority)
3. Calls FundCrapsHouse to fund the house bankroll

#### Check Devnet State

```bash
# Check program accounts
solana account F4e4avXd1r9J2KSck7vq1srux4X8KYCE2jwTW2x4a4Gi --url devnet

# Check vault CRAP balance
spl-token balance 7frAenkamJSASBH9YukkzBsSMz9paQdYuSGw4SjWkXrf --owner HS2suUEiabC67XyU4FxhogfxkixwYnKxH9eTgLxGnvX8 --url devnet
```

### Environment Variables for Devnet

```env
# Required
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_RPC_ENDPOINT=https://devnet.helius-rpc.com/?api-key=YOUR_KEY

# Admin configuration
ADMIN_KEYPAIR_PATH=/home/r/.config/solana/id.json
ADMIN_KEYPAIR=base58-encoded-secret-key

# Optional
ADMIN_API_TOKEN=your-secure-token
```

### Devnet vs Localnet Differences

| Feature | Localnet | Devnet |
|---------|----------|--------|
| Token Mints | Vanity addresses (CRAP..., RNG...) | Created via spl-token |
| RNG Source | Injected via API | Real entropy/simulation |
| Program Build | `cargo build-sbf` | `cargo build-sbf --features devnet` |
| Persistence | Reset on validator restart | Persists on devnet |

### Troubleshooting Devnet

#### "InsufficientBankroll" Error
The house treasury needs CRAP tokens. Run:
```bash
node fund-house-devnet.mjs
```

#### Wallet Shows Wrong Network
Ensure Phantom is set to "Devnet" in Developer Settings.

#### Transaction Fails
1. Check you have enough devnet SOL for fees
2. Check you have enough CRAP tokens for the bet
3. Verify the program is deployed: `solana program show JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK --url devnet`
