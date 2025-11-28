# Network Abstraction Layer Architecture

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Application Layer                       │
│  (Components, Hooks, Stores, API Routes)                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ imports from
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                    Public API (index.ts)                     │
│  getConnection(), setNetworkMode(), withFallback(), etc.    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ delegates to
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                NetworkProvider (provider.ts)                 │
│          Coordinates NetworkManager & ConnectionManager      │
└───────────────┬────────────────────────┬────────────────────┘
                │                        │
      ┌─────────┘                        └─────────┐
      ↓                                            ↓
┌──────────────────────┐              ┌──────────────────────┐
│  NetworkManager      │              │ ConnectionManager    │
│  (networkManager.ts) │              │ (connectionManager.ts)│
│                      │              │                      │
│ • Network mode state │              │ • RPC connections    │
│ • Network config     │              │ • Failover logic     │
│ • Validation         │              │ • Failure tracking   │
└──────────┬───────────┘              └──────────┬───────────┘
           │                                     │
           │ reads from                          │ reads from
           ↓                                     ↓
┌─────────────────────────────────────────────────────────────┐
│              Configuration (config.ts)                       │
│  • NETWORK_CONFIGS (endpoints per network)                  │
│  • FAILOVER_CONFIG (thresholds)                             │
│  • DEFAULT_CONNECTION_OPTIONS                               │
└─────────────────────────────────────────────────────────────┘
           ↑
           │ implements
           │
┌─────────────────────────────────────────────────────────────┐
│                   Types (types.ts)                           │
│  • NetworkMode, NetworkConfig                               │
│  • RpcConnectionManager, NetworkModeManager                 │
│  • ConnectionOptions, FallbackOptions                       │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### 1. Types Layer (`types.ts`)
**Responsibility**: Define contracts and interfaces

- Core types (`NetworkMode`, `NetworkConfig`)
- Manager interfaces (`RpcConnectionManager`, `NetworkModeManager`)
- Configuration types (`ConnectionOptions`, `FallbackOptions`)

**Dependencies**: None (pure type definitions)

### 2. Configuration Layer (`config.ts`)
**Responsibility**: Centralize all configuration

- Network endpoint definitions
- Failover behavior settings
- Default connection options
- Makes configuration changes easy and visible

**Dependencies**: Types layer only

### 3. NetworkManager (`networkManager.ts`)
**Responsibility**: Manage network mode state

- Track current network (localnet/devnet)
- Validate network mode switches
- Provide network-specific configuration
- Single source of truth for "which network"

**Dependencies**: Types, Config

**Key Methods**:
- `getNetworkMode()`: Get current network
- `setNetworkMode(mode)`: Switch networks
- `getNetworkConfig(mode)`: Get config for network

### 4. ConnectionManager (`connectionManager.ts`)
**Responsibility**: Manage RPC connections

- Create and maintain Solana connections
- Track connection health
- Implement failover between endpoints
- Handle rate limit detection
- Prevent concurrent endpoint switches

**Dependencies**: Types, Config

**Key Methods**:
- `getConnection()`: Get active connection
- `reportSuccess()`: Reset failure counter
- `reportFailure(error)`: Track failure, maybe failover
- `switchToNextEndpoint()`: Manual failover

**Failover Logic**:
```
Request fails
    ↓
Increment failure counter
    ↓
Is rate limit error? (429, "rate limit")
    ↓ Yes              ↓ No
  Count >= 1         Count >= 3
    ↓                  ↓
Switch to next endpoint
    ↓
Reset failure counter
```

### 5. NetworkProvider (`provider.ts`)
**Responsibility**: Unified API coordinator

- Instantiate and coordinate both managers
- Provide high-level operations
- Maintain singleton instance
- Handle network switches by updating both managers

**Dependencies**: Types, NetworkManager, ConnectionManager

**Key Methods**:
- All NetworkManager methods (delegated)
- All ConnectionManager methods (delegated)
- `withFallback(operation, retries)`: Retry logic

### 6. Public API (`index.ts`)
**Responsibility**: Clean, documented exports

- Export simple functions (not classes)
- Comprehensive JSDoc documentation
- Re-export useful types
- Hide internal complexity

**Dependencies**: NetworkProvider

## Data Flow Examples

### Example 1: Network Switch

```
Component calls setNetworkMode('localnet')
    ↓
index.ts → networkProvider.setNetworkMode('localnet')
    ↓
NetworkProvider:
    1. networkManager.setNetworkMode('localnet')
    2. Get new endpoints from networkManager
    3. connectionManager.setEndpoints(new_endpoints)
    ↓
State updated, next getConnection() uses new network
```

### Example 2: RPC Call with Failover

```
Component calls withFallback(async (conn) => conn.getSlot())
    ↓
index.ts → networkProvider.withFallback(operation)
    ↓
NetworkProvider.withFallback:
    Attempt 1:
        1. connection = connectionManager.getConnection()
        2. result = await operation(connection)
        3. Success! connectionManager.reportSuccess()
        4. Return result

    If Attempt 1 fails:
        1. connectionManager.reportFailure(error)
        2. If threshold reached → switchToNextEndpoint()
        3. Wait 500ms
        4. Retry...
```

### Example 3: Automatic Failover Trigger

```
Multiple requests fail
    ↓
Each calls connectionManager.reportFailure(error)
    ↓
ConnectionManager tracks: consecutiveFailures++
    ↓
Is rate limit? threshold = 1 : threshold = 3
    ↓
consecutiveFailures >= threshold?
    ↓ Yes
Call switchToNextEndpoint()
    ↓
Synchronized switch (prevent concurrent)
    ↓
Create new Connection with next endpoint
    ↓
Reset consecutiveFailures = 0
    ↓
Next request uses new endpoint
```

## Backward Compatibility

```
Old Code:
import { getConnection } from '@/lib/rpcManager'
    ↓
rpcManager.ts (compatibility layer)
    ↓
import { getConnection as impl } from '@/lib/network'
    ↓
Returns impl() // delegates to new abstraction
```

The old `rpcManager.ts` is now just a thin wrapper that delegates all calls to the new network abstraction, ensuring zero breaking changes.

## Extension Points

### Adding a New Network

1. Update `types.ts`:
   ```typescript
   export type NetworkMode = "localnet" | "devnet" | "mainnet";
   ```

2. Update `config.ts`:
   ```typescript
   export const NETWORK_CONFIGS: Record<NetworkMode, NetworkConfig> = {
     // ... existing
     mainnet: {
       name: "Mainnet",
       endpoints: ["https://api.mainnet-beta.solana.com", ...],
     },
   };
   ```

That's it! The architecture handles the rest.

### Customizing Failover Behavior

Edit `config.ts`:
```typescript
export const FAILOVER_CONFIG = {
  failureThreshold: 5,      // More tolerant
  rateLimitThreshold: 2,    // Less aggressive on rate limits
};
```

### Custom Connection Logic

Extend `ConnectionManager` or create a new manager that implements `RpcConnectionManager` interface, then use it in `NetworkProvider`.

## Thread Safety

The `ConnectionManager` uses synchronization to prevent concurrent endpoint switches:

```typescript
private isSwitching = false;
private switchPromise: Promise<void> | null = null;

async switchToNextEndpoint() {
  if (this.isSwitching && this.switchPromise) {
    return this.switchPromise; // Wait for in-progress switch
  }

  this.isSwitching = true;
  this.switchPromise = (async () => {
    // ... perform switch
  })();

  return this.switchPromise;
}
```

This ensures that if multiple concurrent requests trigger a failover, only one actual endpoint switch occurs.

## Singleton Pattern

The `NetworkProvider` is instantiated once as a singleton:

```typescript
// provider.ts
const networkProvider = new NetworkProvider();
export default networkProvider;
```

This ensures consistent state across the entire application - all components see the same network mode and connection state.

## Testing Strategy

### Unit Tests

- **Types**: TypeScript compilation
- **Config**: Validate structure and values
- **NetworkManager**: Test mode switching and validation
- **ConnectionManager**: Test failover logic, failure tracking
- **NetworkProvider**: Test coordination between managers

### Integration Tests

- Test full flow: network switch → connection update
- Test failover: simulate failures → verify endpoint change
- Test rate limit detection → verify fast failover

### End-to-End Tests

- Use in real components
- Monitor RPC calls in devnet
- Verify automatic recovery from failures

## Performance Considerations

### Singleton Connection

Connections are reused (singleton per network), avoiding unnecessary connection creation overhead.

### Lazy Initialization

Connections are created only when first requested, not at import time.

### Minimal Overhead

The abstraction adds minimal overhead - just a few function calls to delegate between layers.

### Efficient Failover

Synchronization prevents redundant endpoint switches when multiple requests fail simultaneously.

## Security Considerations

### Endpoint Validation

- Endpoints are defined in configuration, not user input
- TypeScript ensures only valid network modes are used

### Connection Options

- `disableRetryOnRateLimit: true` - We handle retries ourselves
- Configurable timeouts prevent hanging connections

### Error Handling

- All errors are caught and reported
- Sensitive error details are logged but not exposed to UI
- Graceful degradation on failure
