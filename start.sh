#!/bin/bash
#
# DevStation - Start Script for Linux/macOS
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo -e "${GREEN}  DevStation${NC}"
echo "  ========================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo ""
    echo "Install Node.js from: https://nodejs.org/"
    echo "Or use your package manager:"
    echo "  Ubuntu/Debian: sudo apt install nodejs npm"
    echo "  macOS:         brew install node"
    echo "  Fedora:        sudo dnf install nodejs"
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "  Node.js: ${GREEN}$NODE_VERSION${NC}"

# Check if npm dependencies are installed
if [ ! -d "node_modules" ]; then
    echo ""
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to install dependencies${NC}"
        exit 1
    fi
fi

echo ""
echo -e "  Starting server on ${GREEN}http://localhost:4000${NC}"
echo ""

# Open browser (platform-specific)
if command -v xdg-open &> /dev/null; then
    # Linux
    (sleep 2 && xdg-open "http://localhost:4000") &
elif command -v open &> /dev/null; then
    # macOS
    (sleep 2 && open "http://localhost:4000") &
fi

# Start the server
node server.js
