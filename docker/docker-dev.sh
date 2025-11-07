#!/bin/bash
#
# Docker Development Environment Helper
#
# This script helps set up environment variables for local Docker development.
# Following 12-factor app principles, this script does NOT automatically set
# environment variables. Instead, it provides instructions and helpers.
#
# Usage:
#   ./docker/docker-dev.sh status          - Check Docker services
#   ./docker/docker-dev.sh env             - Show required environment variables
#   ./docker/docker-dev.sh token           - Get API token from Firefly UI
#   ./docker/docker-dev.sh seed            - Run seeding script (requires token)
#   ./docker/docker-dev.sh test            - Test CLI with current env vars
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

command_status() {
    echo -e "${BLUE}=== Docker Services Status ===${NC}"
    cd "$PROJECT_ROOT"
    docker-compose ps
}

command_env() {
    echo -e "${BLUE}=== Required Environment Variables for Development ===${NC}\n"

    echo "To use the CLI with the Docker development environment, set these variables:"
    echo ""
    echo -e "${GREEN}export FIREFLY_API_URL=http://localhost:8080/api/v1${NC}"
    echo -e "${GREEN}export FIREFLY_API_TOKEN=<your-token-here>${NC}"
    echo ""
    echo "Then run CLI commands normally:"
    echo -e "${YELLOW}  ./budget.sh finalize-budget -m 1${NC}"
    echo -e "${YELLOW}  ./budget.sh budget-report -m 1${NC}"
    echo ""
    echo "Current environment:"
    if [ -n "$FIREFLY_API_URL" ]; then
        echo -e "  FIREFLY_API_URL: ${GREEN}${FIREFLY_API_URL}${NC}"
    else
        echo -e "  FIREFLY_API_URL: ${RED}Not set${NC}"
    fi

    if [ -n "$FIREFLY_API_TOKEN" ]; then
        # Mask the token for security
        masked_token="${FIREFLY_API_TOKEN:0:10}...${FIREFLY_API_TOKEN: -4}"
        echo -e "  FIREFLY_API_TOKEN: ${GREEN}${masked_token}${NC}"
    else
        echo -e "  FIREFLY_API_TOKEN: ${RED}Not set${NC}"
    fi
    echo ""

    if [ -z "$FIREFLY_API_URL" ] || [ -z "$FIREFLY_API_TOKEN" ]; then
        echo -e "${YELLOW}⚠ Environment variables not fully configured${NC}"
        echo ""
        echo "Optional: Create a local helper script (gitignored):"
        echo ""
        echo "cat > budget-dev.sh << 'EOF'"
        echo "#!/bin/bash"
        echo "export FIREFLY_API_URL=http://localhost:8080/api/v1"
        echo "export FIREFLY_API_TOKEN=<your-token>"
        echo './budget.sh "$@"'
        echo "EOF"
        echo "chmod +x budget-dev.sh"
        echo ""
        echo "Then use: ./budget-dev.sh finalize-budget -m 1"
    else
        echo -e "${GREEN}✓ Environment configured correctly${NC}"
    fi
}

command_token() {
    echo -e "${BLUE}=== Getting API Token ===${NC}\n"

    echo "1. Open Firefly III: http://localhost:8080"
    echo "2. Log in with your account"
    echo "3. Go to: Options → Profile → OAuth"
    echo "4. Under 'Personal Access Tokens', click 'Create New Token'"
    echo "5. Name it: 'Budgeting Toolkit CLI'"
    echo "6. Copy the token and set it:"
    echo ""
    echo -e "${GREEN}export FIREFLY_API_TOKEN=<paste-token-here>${NC}"
    echo ""
    echo "Note: Keep this token secure. It provides full access to your Firefly instance."
}

command_seed() {
    echo -e "${BLUE}=== Seeding Development Database ===${NC}\n"

    if [ -z "$FIREFLY_API_TOKEN" ]; then
        echo -e "${RED}Error: FIREFLY_API_TOKEN not set${NC}"
        echo ""
        echo "Run: ./docker/docker-dev.sh token"
        exit 1
    fi

    export FIREFLY_URL="${FIREFLY_API_URL%/api/v1}"
    export FIREFLY_URL="${FIREFLY_URL:-http://localhost:8080}"

    echo "Using configuration:"
    echo "  FIREFLY_URL: $FIREFLY_URL"
    echo "  FIREFLY_API_TOKEN: ${FIREFLY_API_TOKEN:0:10}...${FIREFLY_API_TOKEN: -4}"
    echo ""

    "$SCRIPT_DIR/seed-data/seed-firefly.sh"
}

command_test() {
    echo -e "${BLUE}=== Testing CLI with Current Environment ===${NC}\n"

    if [ -z "$FIREFLY_API_URL" ] || [ -z "$FIREFLY_API_TOKEN" ]; then
        echo -e "${RED}Error: Environment variables not set${NC}"
        echo ""
        command_env
        exit 1
    fi

    cd "$PROJECT_ROOT"

    echo "Testing connection to Firefly III..."
    response=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $FIREFLY_API_TOKEN" "$FIREFLY_API_URL/about")

    if [ "$response" = "200" ]; then
        echo -e "${GREEN}✓ API connection successful${NC}"
        echo ""
        echo "You can now run CLI commands:"
        echo -e "${YELLOW}  ./budget.sh finalize-budget -m 1${NC}"
        echo -e "${YELLOW}  ./budget.sh budget-report -m 1${NC}"
    else
        echo -e "${RED}✗ API connection failed (HTTP $response)${NC}"
        echo ""
        echo "Check that:"
        echo "  1. Docker services are running: ./docker/docker-dev.sh status"
        echo "  2. API token is correct: ./docker/docker-dev.sh token"
        exit 1
    fi
}

# Main command dispatcher
case "${1:-}" in
    status)
        command_status
        ;;
    env)
        command_env
        ;;
    token)
        command_token
        ;;
    seed)
        command_seed
        ;;
    test)
        command_test
        ;;
    *)
        echo -e "${BLUE}Docker Development Environment Helper${NC}\n"
        echo "Usage: $0 <command>"
        echo ""
        echo "Commands:"
        echo "  status    Check Docker services status"
        echo "  env       Show required environment variables"
        echo "  token     Instructions for getting API token"
        echo "  seed      Seed database with test data"
        echo "  test      Test CLI connection"
        echo ""
        echo "Examples:"
        echo "  $0 status"
        echo "  $0 env"
        echo "  $0 seed"
        exit 1
        ;;
esac
