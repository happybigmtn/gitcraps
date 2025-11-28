#!/bin/bash
#
# Generate TypeScript types from Rust definitions.
#
# This script runs the TypeScript bindings generator using ts-rs.
# It exports type definitions from the Rust api crate to the frontend.

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "Generating TypeScript types from Rust..."

# Create generated directory if it doesn't exist
mkdir -p frontend/orecraps/src/generated

# Run the export_bindings test which triggers ts-rs generation
cargo test --package ore-api --features ts-bindings export_bindings

echo ""
echo "TypeScript types generated to frontend/orecraps/src/generated/"
echo ""
echo "Generated files:"
ls -lh frontend/orecraps/src/generated/*.ts 2>/dev/null || echo "  (no .ts files found - check for errors above)"
