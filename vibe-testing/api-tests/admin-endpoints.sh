#!/bin/bash
# Admin API Endpoint Tests (IKA-282)
# Run: ./admin-endpoints.sh

# Load token from .env
VIBE_API_TOKEN=$(grep '^VIBE_API_TOKEN=' /Users/rupeshpanwar/Downloads/Projects/iKanban/.env | cut -d'=' -f2)
BASE_URL="https://api.scho1ar.com/api"
WORKSPACE_ID="0858ac34-db41-4fb7-8820-7b4d45c74229"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

test_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local expected_status=$4
    local payload=$5

    if [ -z "$payload" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
            -H "Authorization: Bearer $VIBE_API_TOKEN" \
            -H "Content-Type: application/json")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
            -H "Authorization: Bearer $VIBE_API_TOKEN" \
            -H "Content-Type: application/json" \
            -d "$payload")
    fi

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" == "$expected_status" ]; then
        # Check for success:true in response
        if echo "$body" | grep -q '"success":true'; then
            echo -e "${GREEN}PASS${NC} $name (HTTP $http_code)"
            PASSED=$((PASSED + 1))
        else
            echo -e "${RED}FAIL${NC} $name - Missing success:true in response"
            echo "  Response: $body"
            FAILED=$((FAILED + 1))
        fi
    else
        echo -e "${RED}FAIL${NC} $name - Expected $expected_status, got $http_code"
        echo "  Response: $body"
        FAILED=$((FAILED + 1))
    fi
}

echo "=========================================="
echo "Admin API Endpoint Tests"
echo "=========================================="
echo ""

# Dashboard endpoints
echo "--- Dashboard ---"
test_endpoint "GET /admin/{id}/stats" "GET" "/admin/$WORKSPACE_ID/stats" "200"
test_endpoint "GET /admin/{id}/activity" "GET" "/admin/$WORKSPACE_ID/activity" "200"

# Users endpoints
echo ""
echo "--- Users ---"
test_endpoint "GET /admin/{id}/users" "GET" "/admin/$WORKSPACE_ID/users" "200"

# Invitations endpoints
echo ""
echo "--- Invitations ---"
test_endpoint "GET /admin/{id}/invitations" "GET" "/admin/$WORKSPACE_ID/invitations" "200"

# Permissions endpoints
echo ""
echo "--- Permissions ---"
test_endpoint "GET /admin/{id}/permissions" "GET" "/admin/$WORKSPACE_ID/permissions" "200"

# Features endpoints
echo ""
echo "--- Features ---"
test_endpoint "GET /admin/{id}/features" "GET" "/admin/$WORKSPACE_ID/features" "200"

# Configuration endpoints
echo ""
echo "--- Configuration ---"
test_endpoint "GET /admin/{id}/configuration" "GET" "/admin/$WORKSPACE_ID/configuration" "200"

# Trust & Safety endpoints (IKA-283 fixed response format)
echo ""
echo "--- Trust & Safety ---"
test_endpoint "GET /admin/trust-profiles/flagged" "GET" "/admin/trust-profiles/flagged" "200"
test_endpoint "GET /admin/abuse-signals" "GET" "/admin/abuse-signals" "200"

echo ""
echo "=========================================="
echo "Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}"
echo "=========================================="

if [ $FAILED -gt 0 ]; then
    exit 1
fi
