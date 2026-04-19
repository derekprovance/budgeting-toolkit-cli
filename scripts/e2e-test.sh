#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
TSX="$ROOT/node_modules/.bin/tsx"
CLI="$ROOT/src/index.ts"
CONFIG="$SCRIPT_DIR/e2e-config.yaml"

# Determine month/year for tests
MONTH=$(date +%-m)
YEAR=$(date +%Y)

echo "=== E2E Tests (month=$MONTH year=$YEAR) ==="

# 1. analyze
echo "[1/3] analyze command..."
"$TSX" "$CLI" analyze --month "$MONTH" --year "$YEAR" --config "$CONFIG"
echo "  PASS: analyze"

# 2. report
echo "[2/3] report command..."
"$TSX" "$CLI" report --month "$MONTH" --year "$YEAR" --config "$CONFIG"
echo "  PASS: report"

# 3. categorize (dry-run against the seeded e2e-test tag)
echo "[3/3] categorize command (dry-run)..."
"$TSX" "$CLI" categorize "e2e-test" --dry-run --config "$CONFIG"
echo "  PASS: categorize (dry-run)"

echo ""
echo "=== All E2E tests passed ==="
