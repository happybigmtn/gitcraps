#!/bin/bash
# Localnet setup script for ORE/OreCraps

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROGRAM_SO="$PROJECT_ROOT/target/deploy/ore.so"
KEYPAIR="${KEYPAIR:-$HOME/.config/solana/id.json}"
PROGRAM_ID="JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_dependencies() {
    log_info "Checking dependencies..."
    command -v solana >/dev/null 2>&1 || { log_error "solana CLI not found"; exit 1; }
    command -v solana-test-validator >/dev/null 2>&1 || { log_error "solana-test-validator not found"; exit 1; }
}

build_program() {
    log_info "Building program..."
    cd "$PROJECT_ROOT"
    cargo build-sbf --manifest-path program/Cargo.toml
    if [ ! -f "$PROGRAM_SO" ]; then
        log_error "Program build failed - $PROGRAM_SO not found"
        exit 1
    fi
    log_info "Program built successfully"
}

start_validator() {
    log_info "Starting local validator..."

    # Check if validator is already running
    if pgrep -f "solana-test-validator" > /dev/null; then
        log_warn "Validator already running"
        return 0
    fi

    # Start validator in background
    solana-test-validator \
        --reset \
        --bpf-program "$PROGRAM_ID" "$PROGRAM_SO" \
        --ledger "$PROJECT_ROOT/.localnet-ledger" \
        > "$PROJECT_ROOT/.localnet-validator.log" 2>&1 &

    # Wait for validator to start
    log_info "Waiting for validator to start..."
    for i in {1..30}; do
        if solana cluster-version -u localhost >/dev/null 2>&1; then
            log_info "Validator started successfully"
            return 0
        fi
        sleep 1
    done

    log_error "Validator failed to start within 30 seconds"
    exit 1
}

fund_accounts() {
    log_info "Funding accounts..."

    # Set to localnet
    solana config set -u localhost

    # Airdrop to main keypair
    solana airdrop 100 "$KEYPAIR" -u localhost || true

    log_info "Accounts funded"
}

initialize_program() {
    log_info "Initializing program..."

    CLI_PATH="$PROJECT_ROOT/target/release/ore-cli"

    if [ ! -f "$CLI_PATH" ]; then
        log_warn "CLI not found, building..."
        cd "$PROJECT_ROOT"
        cargo build --release -p ore-cli
    fi

    # Initialize the board/config (if CLI supports it)
    COMMAND=initialize RPC="http://127.0.0.1:8899" KEYPAIR="$KEYPAIR" "$CLI_PATH" || {
        log_warn "Initialize command may not exist or already initialized"
    }

    log_info "Program initialization complete"
}

print_status() {
    echo ""
    echo "========================================="
    echo "  LOCALNET SETUP COMPLETE"
    echo "========================================="
    echo "  RPC URL: http://127.0.0.1:8899"
    echo "  Program ID: $PROGRAM_ID"
    echo "  Validator logs: $PROJECT_ROOT/.localnet-validator.log"
    echo "========================================="
    echo ""
}

# Main execution
case "${1:-setup}" in
    "build")
        check_dependencies
        build_program
        ;;
    "start")
        check_dependencies
        start_validator
        fund_accounts
        ;;
    "stop")
        log_info "Stopping validator..."
        pkill -f "solana-test-validator" || log_warn "No validator running"
        ;;
    "status")
        if pgrep -f "solana-test-validator" > /dev/null; then
            log_info "Validator is running"
            solana cluster-version -u localhost
        else
            log_warn "Validator is not running"
        fi
        ;;
    "setup"|*)
        check_dependencies
        build_program
        start_validator
        fund_accounts
        initialize_program
        print_status
        ;;
esac
