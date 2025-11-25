#!/bin/bash
# Round Cranking Script for OreCraps
# This script monitors the board state and automatically starts new rounds when needed
# For devnet testing (without entropy integration)

set -e

# Configuration
KEYPAIR="${KEYPAIR:-~/.config/solana/id.json}"
RPC="${RPC:-https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7}"
DURATION="${DURATION:-3000}"  # Default: 3000 slots (~20 minutes)
CHECK_INTERVAL="${CHECK_INTERVAL:-60}"  # Check every 60 seconds

CLI_PATH="$(dirname "$0")/../target/release/ore-cli"

echo "================================"
echo "OreCraps Round Cranking Script"
echo "================================"
echo "RPC: $RPC"
echo "Keypair: $KEYPAIR"
echo "Duration: $DURATION slots"
echo "Check interval: $CHECK_INTERVAL seconds"
echo ""

while true; do
    echo "[$(date)] Checking board state..."

    # Get board state
    BOARD_OUTPUT=$(COMMAND=board RPC="$RPC" KEYPAIR="$KEYPAIR" "$CLI_PATH" 2>&1)

    # Parse the output
    END_SLOT=$(echo "$BOARD_OUTPUT" | grep "End slot:" | awk '{print $3}')
    TIME_REMAINING=$(echo "$BOARD_OUTPUT" | grep "Time remaining:" | awk '{print $3}')

    echo "  End slot: $END_SLOT"
    echo "  Time remaining: ${TIME_REMAINING}s"

    # Check if time remaining is 0 or negative
    if (( $(echo "$TIME_REMAINING <= 0" | bc -l) )); then
        echo "[$(date)] Round has ended! Starting new round..."

        # Start a new round
        COMMAND=start_round DURATION="$DURATION" RPC="$RPC" KEYPAIR="$KEYPAIR" "$CLI_PATH" 2>&1 || true

        echo "[$(date)] New round started!"
    else
        echo "[$(date)] Round is still active. Waiting..."
    fi

    echo ""
    sleep "$CHECK_INTERVAL"
done
