#!/bin/bash
# ═══════════════════════════════════════════════════════
#  TAZ Furnitures — Backend Startup Script
#  Works on: Linux, macOS, Windows (Git Bash / WSL)
# ═══════════════════════════════════════════════════════

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${CYAN}  ╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}  ║   TAZ FURNITURES — Backend v2.4          ║${NC}"
echo -e "${CYAN}  ╚══════════════════════════════════════════╝${NC}"
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo -e "${RED}  ✗ Node.js not found. Install from: https://nodejs.org${NC}"
  exit 1
fi
echo -e "${GREEN}  ✓ Node.js $(node -e 'process.stdout.write(process.version)')${NC}"

# Create data directory
mkdir -p data
echo -e "${GREEN}  ✓ Data directory ready${NC}"

PORT=${PORT:-3747}
echo ""
echo -e "  API:      ${CYAN}http://localhost:$PORT/api/${NC}"
echo -e "  Frontend: Open ${CYAN}taz_furnitures_v24.html${NC} in your browser"
echo -e "  PIN:      ${CYAN}1234${NC} (change in Settings after login)"
echo ""
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop"
echo ""

exec node server.js
