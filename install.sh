#!/bin/bash
#
# DevStation - Install Script for Linux/macOS
# Creates a global 'devstation' command
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${GREEN}  DevStation Installer${NC}"
echo "  ========================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo ""
    echo "Install Node.js first:"
    echo "  Ubuntu/Debian: sudo apt install nodejs npm"
    echo "  macOS:         brew install node"
    echo "  Fedora:        sudo dnf install nodejs"
    exit 1
fi

# Install npm dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
cd "$SCRIPT_DIR"
npm install

# Create symlinks
echo ""
echo -e "${YELLOW}Creating global commands...${NC}"

# Determine install location
if [ -w "/usr/local/bin" ]; then
    BIN_DIR="/usr/local/bin"
else
    BIN_DIR="$HOME/.local/bin"
    mkdir -p "$BIN_DIR"

    # Add to PATH if needed
    if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
        echo ""
        echo -e "${YELLOW}Adding $BIN_DIR to PATH...${NC}"
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc" 2>/dev/null || true
        echo -e "Run: ${GREEN}source ~/.bashrc${NC} (or restart your terminal)"
    fi
fi

# Create wrapper scripts
cat > "$BIN_DIR/devstation" << EOF
#!/bin/bash
cd "$SCRIPT_DIR" && node server.js "\$@"
EOF
chmod +x "$BIN_DIR/devstation"

cat > "$BIN_DIR/devd" << EOF
#!/bin/bash
node "$SCRIPT_DIR/cli.js" "\$@"
EOF
chmod +x "$BIN_DIR/devd"

echo ""
echo -e "${GREEN}Installation complete!${NC}"
echo ""
echo "Commands available:"
echo -e "  ${GREEN}devstation${NC}  - Start the dashboard server"
echo -e "  ${GREEN}devd${NC}        - CLI tool (devd status, devd start <id>, etc.)"
echo ""
echo "Quick start:"
echo "  1. Run: devstation"
echo "  2. Open: http://localhost:4000"
echo ""
