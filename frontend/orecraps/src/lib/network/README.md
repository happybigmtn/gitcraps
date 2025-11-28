# Network Abstraction Layer

A clean, modular abstraction for managing Solana RPC connections and network switching in the OreCraps application.

## Overview

The network abstraction layer decouples network configuration from RPC connection management, providing a clear interface for components to use while maintaining automatic failover capabilities.

## Architecture

```
network/
├── types.ts              # Type definitions and interfaces
├── config.ts             # Network configurations and constants
├── networkManager.ts     # Network mode state management
├── connectionManager.ts  # RPC connection with failover logic
├── provider.ts           # Unified API coordinating both managers
├── index.ts             # Public API exports
└── README.md            # This file
```

## Key Concepts

### Separation of Concerns

1. **Network Configuration** (`config.ts`)
   - Defines available networks and their endpoints
   - Configures failover behavior
   - Centralizes connection options

2. **Network Management** (`networkManager.ts`)
   - Tracks current network mode (localnet/devnet)
   - Validates network configurations
   - Provides network-specific settings

3. **Connection Management** (`connectionManager.ts`)
   - Manages Solana RPC connections
   - Implements automatic failover between endpoints
   - Tracks failure states and triggers switches

4. **Unified Provider** (`provider.ts`)
   - Coordinates network and connection managers
   - Provides single entry point for operations
   - Maintains singleton state

## Usage Examples

### Basic Connection

```typescript
import { getConnection, withFallback } from '@/lib/network';

// Get current connection
const connection = getConnection();
const slot = await connection.getSlot();

// Use with automatic failover
const balance = await withFallback(async (conn) => {
  return conn.getBalance(publicKey);
});
```

### Network Switching

```typescript
import { setNetworkMode, getNetworkMode } from '@/lib/network';

// Switch to localnet
setNetworkMode('localnet');

// Check current network
const current = getNetworkMode(); // 'localnet'
```

### Manual Error Handling

```typescript
import { getConnection, reportSuccess, reportFailure } from '@/lib/network';

try {
  const connection = getConnection();
  const result = await connection.getAccountInfo(address);
  reportSuccess(); // Reset failure counter
  return result;
} catch (error) {
  await reportFailure(error as Error); // May trigger failover
  throw error;
}
```

### Advanced: Multiple Operations

```typescript
import { withFallback } from '@/lib/network';

// Fetch multiple accounts with automatic failover
const [account1, account2] = await withFallback(async (connection) => {
  return Promise.all([
    connection.getAccountInfo(address1),
    connection.getAccountInfo(address2),
  ]);
});
```

## Failover Behavior

The connection manager automatically switches between endpoints when:

1. **Consecutive Failures**: After 3 consecutive failures on regular errors
2. **Rate Limiting**: After 1 failure on rate limit errors (429, "rate limit", "Too Many Requests")

### Failover Flow

```
Request → Try Endpoint 1 → Success ✓
                        → Failure → Track failure count
                                 → Count >= Threshold?
                                    → Yes → Switch to Endpoint 2
                                    → No  → Retry with same endpoint
```

## Migration Guide

### From Old API

The old `rpcManager.ts` API is still supported but deprecated. Migrate to the new API:

```typescript
// Old API (still works)
import { getConnection, withFallback } from '@/lib/rpcManager';

// New API (recommended)
import { getConnection, withFallback } from '@/lib/network';
```

All functions have identical signatures, so migration is a simple import change.

### Creating New Features

For new features, always use the network abstraction directly:

```typescript
import { getConnection, withFallback, setNetworkMode } from '@/lib/network';
```

## Configuration

### Adding New Networks

Edit `/src/lib/network/config.ts`:

```typescript
export const NETWORK_CONFIGS: Record<NetworkMode, NetworkConfig> = {
  localnet: { /* ... */ },
  devnet: { /* ... */ },
  mainnet: {  // Add new network
    name: "Mainnet",
    endpoints: [
      "https://api.mainnet-beta.solana.com",
      // Add more endpoints for failover
    ],
  },
};
```

Update the `NetworkMode` type in `types.ts`:

```typescript
export type NetworkMode = "localnet" | "devnet" | "mainnet";
```

### Adjusting Failover Behavior

Edit `/src/lib/network/config.ts`:

```typescript
export const FAILOVER_CONFIG = {
  failureThreshold: 3,      // Change number of failures before switch
  rateLimitThreshold: 1,    // Change rate limit switch threshold
};
```

### Connection Options

Edit `/src/lib/network/config.ts`:

```typescript
export const DEFAULT_CONNECTION_OPTIONS = {
  commitment: "confirmed",   // or "processed", "finalized"
  confirmTransactionInitialTimeout: 60000,  // milliseconds
  disableRetryOnRateLimit: true,
};
```

## Testing

### Manual Testing

```typescript
import { provider } from '@/lib/network';

// Force switch to next endpoint for testing
await provider.switchToNextEndpoint();

// Check current endpoint
console.log(provider.getCurrentEndpoint());
```

### Network Toggle Integration

The NetworkToggle component automatically uses the new abstraction via the store:

```typescript
// src/store/networkStore.ts
import { setNetworkMode } from "@/lib/network";

setNetwork: (network) => {
  setNetworkMode(network);  // Uses new abstraction
  set({ network });
}
```

## Debug Logging

The network layer includes debug logging:

```typescript
// Enable debug logs in browser console
localStorage.debug = 'ConnectionManager,NetworkManager';
```

## API Reference

### Core Functions

- `getConnection()`: Get current Solana connection
- `setNetworkMode(mode)`: Switch network mode
- `getNetworkMode()`: Get current network mode
- `getCurrentEndpoint()`: Get current RPC endpoint URL
- `reportSuccess()`: Report successful RPC call
- `reportFailure(error)`: Report failed RPC call
- `withFallback(operation, maxRetries?)`: Execute with automatic failover

### Types

- `NetworkMode`: "localnet" | "devnet"
- `NetworkConfig`: Network configuration interface
- `ConnectionOptions`: Solana connection options
- `FallbackOptions`: Options for withFallback wrapper

## Benefits

1. **Modularity**: Clear separation between network config and connection management
2. **Testability**: Each component can be tested independently
3. **Extensibility**: Easy to add new networks or failover strategies
4. **Maintainability**: Single source of truth for network behavior
5. **Backward Compatibility**: Existing code continues to work unchanged
6. **Type Safety**: Full TypeScript support with clear interfaces

## Related Files

- `/src/lib/rpcManager.ts`: Legacy compatibility layer (deprecated)
- `/src/store/networkStore.ts`: Zustand store for network state
- `/src/hooks/useBoard.ts`: Example usage in hooks
- `/src/hooks/useCraps.ts`: Example usage in hooks
