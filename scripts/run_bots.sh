#!/bin/bash
# OreCraps Bot Simulation Script
# Creates 5 bots with different strategies, funds them, and runs concurrent mining

set -e

# Configuration
HELIUS_RPC="https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7"
MAIN_KEYPAIR="${MAIN_KEYPAIR:-$HOME/.config/solana/id.json}"
BOT_DIR="/tmp/orecraps_bots"
CLI_PATH="$(cd "$(dirname "$0")/.." && pwd)/target/release/ore-cli"
FUND_AMOUNT="1"  # 1 SOL per bot
BET_AMOUNT="10000000"  # 0.01 SOL per bet

# Bot strategies (square selections)
# Each strategy is a comma-separated list of square indices (0-35)
# Square index = (die1 - 1) * 6 + (die2 - 1)
declare -A STRATEGIES
STRATEGIES[bot1]="lucky7:0,6,12,18,24,30"       # Sum 7: (1,6)(2,5)(3,4)(4,3)(5,2)(6,1)
STRATEGIES[bot2]="field:0,1,7,5,11,29,35,34,28" # Field bets (2,3,4,9,10,11,12)
STRATEGIES[bot3]="random"                        # Random single square each round
STRATEGIES[bot4]="doubles:0,7,14,21,28,35"      # All doubles (1,1)(2,2)(3,3)(4,4)(5,5)(6,6)
STRATEGIES[bot5]="diversified:6,7,8,12,13,14,18,19,20" # Spread across common sums

echo "=============================================="
echo "  OreCraps Bot Simulation"
echo "=============================================="
echo "RPC: $HELIUS_RPC"
echo "Main Keypair: $MAIN_KEYPAIR"
echo "Bot Directory: $BOT_DIR"
echo ""

# Create bot directory
mkdir -p "$BOT_DIR"

# Function to generate a keypair
generate_keypair() {
    local name=$1
    local keypair_path="$BOT_DIR/${name}.json"
    if [ ! -f "$keypair_path" ]; then
        solana-keygen new --no-bip39-passphrase -o "$keypair_path" --force >/dev/null 2>&1
        echo "  Generated keypair for $name" >&2
    fi
    echo "$keypair_path"
}

# Function to get pubkey from keypair
get_pubkey() {
    local keypair_path=$1
    solana-keygen pubkey "$keypair_path"
}

# Function to get balance
get_balance() {
    local pubkey=$1
    solana balance "$pubkey" -u "$HELIUS_RPC" 2>/dev/null | awk '{print $1}'
}

# Function to fund a wallet
fund_wallet() {
    local recipient=$1
    local amount=$2
    echo "Funding $recipient with $amount SOL..."
    solana transfer "$recipient" "$amount" --from "$MAIN_KEYPAIR" -u "$HELIUS_RPC" --allow-unfunded-recipient --fee-payer "$MAIN_KEYPAIR" 2>&1 || true
}

# Function to get squares for a strategy
get_squares() {
    local strategy=$1
    local round_id=$2

    case "$strategy" in
        "random")
            # Random single square (0-35)
            echo $((RANDOM % 36))
            ;;
        *)
            # Parse strategy format "name:squares"
            echo "$strategy" | cut -d: -f2
            ;;
    esac
}

# Function to run a single bot deployment
run_bot_deploy() {
    local bot_name=$1
    local keypair_path=$2
    local square=$3

    echo "[$bot_name] Deploying to square $square..."
    COMMAND=deploy AMOUNT="$BET_AMOUNT" SQUARE="$square" RPC="$HELIUS_RPC" KEYPAIR="$keypair_path" "$CLI_PATH" 2>&1 || true
}

# Function to display board state
show_board_state() {
    echo ""
    echo "=== Current Board State ==="
    COMMAND=board RPC="$HELIUS_RPC" KEYPAIR="$MAIN_KEYPAIR" "$CLI_PATH" 2>&1
    echo ""
}

# Function to show round state
show_round_state() {
    local round_id=$1
    echo ""
    echo "=== Round $round_id State ==="
    COMMAND=round ID="$round_id" RPC="$HELIUS_RPC" KEYPAIR="$MAIN_KEYPAIR" "$CLI_PATH" 2>&1
    echo ""
}

# Function to show miner stats
show_miner_stats() {
    local bot_name=$1
    local pubkey=$2
    echo "--- $bot_name ($pubkey) ---"
    COMMAND=miner AUTHORITY="$pubkey" RPC="$HELIUS_RPC" KEYPAIR="$MAIN_KEYPAIR" "$CLI_PATH" 2>&1 || echo "  No miner account yet"
}

# Step 1: Generate keypairs for all bots
echo ""
echo "Step 1: Generating bot keypairs..."
declare -A BOT_KEYPAIRS
declare -A BOT_PUBKEYS

for bot in bot1 bot2 bot3 bot4 bot5; do
    BOT_KEYPAIRS[$bot]=$(generate_keypair "$bot")
    BOT_PUBKEYS[$bot]=$(get_pubkey "${BOT_KEYPAIRS[$bot]}")
    echo "  $bot: ${BOT_PUBKEYS[$bot]}"
done

# Step 2: Check and fund bots
echo ""
echo "Step 2: Checking and funding bot wallets..."
for bot in bot1 bot2 bot3 bot4 bot5; do
    pubkey="${BOT_PUBKEYS[$bot]}"
    balance=$(get_balance "$pubkey")
    echo "  $bot balance: $balance SOL"

    # Fund if balance is less than 0.5 SOL (using awk for comparison)
    if [ "$(echo "$balance" | awk '{print ($1 < 0.5) ? "1" : "0"}')" = "1" ]; then
        fund_wallet "$pubkey" "$FUND_AMOUNT"
        sleep 5  # Wait for confirmation
        balance=$(get_balance "$pubkey")
        echo "  $bot new balance: $balance SOL"
    fi
done

echo ""
echo "Waiting for all transfers to confirm..."
sleep 10

# Step 3: Show initial board state
echo ""
echo "Step 3: Initial board state..."
show_board_state

# Step 4: Run bot deployments
echo ""
echo "Step 4: Running bot deployments..."
echo "Each bot will deploy using its strategy"
echo ""

# Get current round ID from board
ROUND_ID=$(COMMAND=board RPC="$HELIUS_RPC" KEYPAIR="$MAIN_KEYPAIR" "$CLI_PATH" 2>&1 | grep "Id:" | awk '{print $2}')
echo "Current Round ID: $ROUND_ID"

# Deploy for each bot based on strategy (sequentially for better monitoring)
for bot in bot1 bot2 bot3 bot4 bot5; do
    strategy="${STRATEGIES[$bot]}"
    strategy_name=$(echo "$strategy" | cut -d: -f1)
    squares=$(get_squares "$strategy" "$ROUND_ID")

    echo ""
    echo "[$bot] Strategy: $strategy_name"

    # For multi-square strategies, deploy to first available square
    if [ "$strategy_name" = "random" ]; then
        square=$((RANDOM % 36))
    else
        # Deploy to first square in the list
        square=$(echo "$squares" | cut -d, -f1)
    fi

    run_bot_deploy "$bot" "${BOT_KEYPAIRS[$bot]}" "$square"

    # Delay between bot deployments to avoid RPC rate limits
    sleep 2
done

echo ""
echo "All deployments submitted!"

# Step 5: Show updated board state
echo ""
echo "Step 5: Updated board state after deployments..."
show_board_state
show_round_state "$ROUND_ID"

# Step 6: Show miner stats for all bots
echo ""
echo "Step 6: Bot Performance Summary"
echo "================================"
for bot in bot1 bot2 bot3 bot4 bot5; do
    show_miner_stats "$bot" "${BOT_PUBKEYS[$bot]}"
    echo ""
done

# Step 7: Continuous monitoring mode
echo ""
echo "=============================================="
echo "Entering Continuous Monitoring Mode"
echo "Press Ctrl+C to stop"
echo "=============================================="

round_counter=0
while true; do
    round_counter=$((round_counter + 1))
    echo ""
    echo "=== Monitoring Update #$round_counter ($(date)) ==="

    # Show board state
    show_board_state

    # Check if round has ended
    TIME_REMAINING=$(COMMAND=board RPC="$HELIUS_RPC" KEYPAIR="$MAIN_KEYPAIR" "$CLI_PATH" 2>&1 | grep "Time remaining:" | awk '{print $3}')

    if [ "$(echo "$TIME_REMAINING" | awk '{print ($1 <= 0) ? "1" : "0"}')" = "1" ]; then
        echo "Round has ended! Starting new round..."
        COMMAND=start_round DURATION=3000 RPC="$HELIUS_RPC" KEYPAIR="$MAIN_KEYPAIR" "$CLI_PATH" 2>&1 || true

        # New round - deploy again
        echo "Deploying bots to new round..."
        ROUND_ID=$(COMMAND=board RPC="$HELIUS_RPC" KEYPAIR="$MAIN_KEYPAIR" "$CLI_PATH" 2>&1 | grep "Id:" | awk '{print $2}')

        for bot in bot1 bot2 bot3 bot4 bot5; do
            strategy="${STRATEGIES[$bot]}"
            strategy_name=$(echo "$strategy" | cut -d: -f1)

            if [ "$strategy_name" = "random" ]; then
                square=$((RANDOM % 36))
            else
                squares=$(get_squares "$strategy" "$ROUND_ID")
                square=$(echo "$squares" | cut -d, -f1)
            fi

            run_bot_deploy "$bot" "${BOT_KEYPAIRS[$bot]}" "$square" &
            sleep 0.5
        done
        wait
    fi

    # Show performance every 5 updates
    if [ $((round_counter % 5)) -eq 0 ]; then
        echo ""
        echo "=== Bot Performance Update ==="
        for bot in bot1 bot2 bot3 bot4 bot5; do
            balance=$(get_balance "${BOT_PUBKEYS[$bot]}")
            echo "  $bot: $balance SOL"
        done
    fi

    sleep 30
done
