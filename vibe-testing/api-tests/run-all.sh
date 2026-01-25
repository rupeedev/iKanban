#!/bin/bash
# Run all API tests
# Usage: ./run-all.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================"
echo "Running All API Tests"
echo "============================================"
echo ""

TOTAL_PASSED=0
TOTAL_FAILED=0

for test_file in "$SCRIPT_DIR"/*.sh; do
    if [ "$(basename "$test_file")" != "run-all.sh" ]; then
        echo "Running: $(basename "$test_file")"
        echo "--------------------------------------------"
        bash "$test_file" && echo "" || echo ""
    fi
done

echo ""
echo "============================================"
echo "All API Tests Complete"
echo "============================================"
