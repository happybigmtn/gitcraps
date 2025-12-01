# Coding Patterns & Security Guidelines

Key patterns established from code review. Follow these to avoid common vulnerabilities.

## Rust / Solana Program

### Checked Arithmetic
Always use checked math for u64 operations. Never use `+=`, `-=`, `*=` directly.

```rust
// BAD
balance += amount;

// GOOD
balance = balance
    .checked_add(amount)
    .ok_or(ProgramError::ArithmeticOverflow)?;
```

### Authority Validation
Always verify signer matches stored authority when account already exists.

```rust
// When loading existing account
let position = position_info.as_account_mut::<Position>(&program_id)?;
if position.authority != *signer_info.key {
    return Err(ProgramError::IllegalOwner);
}
```

### Account Ownership
Verify account owner before trusting data.

```rust
if account_info.owner != &expected_program_id {
    return Err(ProgramError::IncorrectProgramId);
}
```

### CEI Pattern (Check-Effects-Interactions)
Prevent reentrancy by updating state before external calls.

```rust
// 1. CHECK - validate inputs
if amount > balance { return Err(...); }

// 2. EFFECTS - update state FIRST
position.pending_winnings = 0;
position.total_claimed = position.total_claimed.checked_add(amount)?;

// 3. INTERACTIONS - external calls LAST
**signer_info.lamports.borrow_mut() += payout;
**source_info.lamports.borrow_mut() -= payout;
```

### Debug Logging
Use feature flags for debug logs in production code.

```rust
#[cfg(feature = "debug")]
sol_log(&format!("Debug: value={}", value));
```

### Bounds Validation
Validate array indices and input ranges.

```rust
if index >= array.len() {
    return Err(ProgramError::InvalidArgument);
}
```

## TypeScript / React

### Memoization
Wrap expensive components and stabilize callbacks.

```typescript
// Memoize component
const MemoizedComponent = React.memo(ExpensiveComponent);

// Stabilize callbacks
const handleClick = useCallback(() => {
  doSomething(id);
}, [id]);

// Memoize computed values
const computed = useMemo(() => expensiveCalc(data), [data]);
```

### Interval Cleanup
Always clear intervals on unmount.

```typescript
useEffect(() => {
  const interval = setInterval(poll, 1000);
  return () => clearInterval(interval);
}, []);
```

### Zustand Selectors
Use shallow comparison for object selections.

```typescript
import { useShallow } from 'zustand/react/shallow';

const { a, b } = useStore(useShallow(state => ({
  a: state.a,
  b: state.b
})));
```

## Git Security

### Never Commit
- `.env` files with secrets
- API keys, private keys
- `node_modules/`, build artifacts

### .gitignore Essentials
```
.env*
!.env.example
*.key
*.pem
node_modules/
target/
```

## API Security

### Command Injection Prevention
Never interpolate user input into shell commands.

```typescript
// BAD
exec(`program ${userInput}`);

// GOOD
spawnSync('program', [userInput], { encoding: 'utf-8' });
```

### Input Validation
Validate and sanitize at system boundaries.

```typescript
const validated = schema.parse(userInput);
```

## On-Chain Only Policy

**CRITICAL: The frontend must NEVER simulate or fake on-chain results.**

All dice rolls, bets, and game outcomes MUST come from real on-chain transactions:

1. **No Simulated Rolls**: Never use `Math.random()` to generate dice results in the frontend
2. **No Fallback to Simulation**: If on-chain transaction fails, show an error - don't simulate
3. **No Demo Mode**: All actions require real on-chain transactions (localnet or mainnet)
4. **Entropy from On-Chain**: Dice results derived from entropy program's Var account values

### On-Chain Entropy Cycle
The settle-round endpoint performs a full commit-reveal cycle:
1. **Open (new_var)**: Create Var account with commit hash of random seed
2. **Sample**: Wait for end_at slot, then sample slot_hash
3. **Reveal**: Submit original seed, entropy program computes final value
4. **Result**: `value % 36` gives winning square, convert to dice: `die1 = floor(sq/6)+1`, `die2 = (sq%6)+1`

### Instruction Discriminators
```typescript
const ORE_NEW_VAR = 19;      // ore program
const ENTROPY_SAMPLE = 5;    // entropy program
const ENTROPY_REVEAL = 4;    // entropy program
```

## Localnet Testing Setup

Reusable pattern for setting up local testing environment:

### Quick Setup (Single Command)
```bash
# From project root
./scripts/localnet-setup.sh setup
```

### Manual Steps
```bash
# 1. Stop any existing validator
pkill -f "solana-test-validator" || true

# 2. Build the program
cargo build-sbf --manifest-path program/Cargo.toml

# 3. Start fresh validator with programs and mint accounts
# NOTE: Entropy program required for on-chain dice rolls!
PROGRAM_ID="JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK"
ENTROPY_ID="3jSkUuYBoJzQPMEzTvkDFXCZUBksPamrVhrnHR9igu2X"
solana-test-validator --reset \
    --bpf-program "$PROGRAM_ID" target/deploy/ore.so \
    --bpf-program "$ENTROPY_ID" /home/r/Coding/entropy/target/sbpf-solana-solana/release/entropy_program.so \
    --account CRAPqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump .localnet-accounts/crap-mint.json \
    --account RNGqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump .localnet-accounts/rng-mint.json \
    --ledger .localnet-ledger > .localnet-validator.log 2>&1 &

# 4. Wait for validator and fund accounts
sleep 5
solana airdrop 100 -u localhost

# 5. Build CLI and initialize program
cargo build --release -p ore-cli
COMMAND=initialize RPC="http://127.0.0.1:8899" KEYPAIR="$HOME/.config/solana/id.json" target/release/ore-cli

# 6. Fund the house for craps betting
cd frontend/orecraps && node fund-house.mjs

# 7. Start frontend
npm run dev
```

### Key Accounts & Mints

**Program IDs:**
- **ORE Program**: `JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK`
- **Entropy Program**: `3jSkUuYBoJzQPMEzTvkDFXCZUBksPamrVhrnHR9igu2X`

**Token Mints (CRITICAL - must match across all code):**
- **RNG Mint**: `RNGqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump`
- **CRAP Mint**: `CRAPqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump`

**PDAs (derived from seeds):**
- **Board PDA**: `FKUBSpmzd2gDdoenmwJRGiZJVcXL5kFD3yeWBYtergMn`
- **Config PDA**: `GJr1omiCV7oSqx1jNtgkgbcXYd4CLVHm1H9MmgYdX83C`
- **Treasury PDA**: `67UWqUQ588E3EBUYH6AZgaQp7Y6JoFY5Wn3syhju4qiX`
- **CrapsGame PDA**: `F4e4avXd1r9J2KSck7vq1srux4X8KYCE2jwTW2x4a4Gi`

### Useful CLI Commands
```bash
# Check board state
COMMAND=board RPC="http://127.0.0.1:8899" KEYPAIR="$HOME/.config/solana/id.json" target/release/ore-cli

# Check round details
COMMAND=round ID=0 RPC="http://127.0.0.1:8899" KEYPAIR="$HOME/.config/solana/id.json" target/release/ore-cli

# Start a new round (admin only)
COMMAND=start_round DURATION=3000 RPC="http://127.0.0.1:8899" KEYPAIR="$HOME/.config/solana/id.json" target/release/ore-cli

# Deploy to mining board
COMMAND=deploy AMOUNT=10000000 SQUARE=0 DICE=7 RPC="http://127.0.0.1:8899" KEYPAIR="$HOME/.config/solana/id.json" target/release/ore-cli
```

### Frontend Environment (.env.local)
```bash
NEXT_PUBLIC_SOLANA_NETWORK=localnet
NEXT_PUBLIC_RPC_ENDPOINT=http://127.0.0.1:8899
ADMIN_KEYPAIR_PATH=/home/r/.config/solana/id.json
TEST_KEYPAIR_SEED=<base64-seed>
ADMIN_API_TOKEN=localnet-test-token-12345
```
