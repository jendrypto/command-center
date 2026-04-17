#!/bin/bash
# Register the Command Center MCP server with openclaw.
#
# Assumes `npm run mcp:build` has been run (which produces
# mcp-server/dist/index.js).
#
# Re-run this script after a rebuild if the path to the MCP server changes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MCP_ENTRY="$REPO_ROOT/mcp-server/dist/index.js"

if [ ! -f "$MCP_ENTRY" ]; then
  echo "✗ MCP server not built yet: $MCP_ENTRY"
  echo "  Run: npm run mcp:build"
  exit 1
fi

# Default to the standard dev port. Override with COMMAND_CENTER_URL env var
# if Command Center is running on a different host/port.
CC_URL="${COMMAND_CENTER_URL:-http://localhost:3005}"

CONFIG=$(cat <<EOF
{
  "command": "node",
  "args": ["$MCP_ENTRY"],
  "env": { "COMMAND_CENTER_URL": "$CC_URL" }
}
EOF
)

echo "Registering command-center MCP server..."
echo "  entry: $MCP_ENTRY"
echo "  url:   $CC_URL"
echo

openclaw mcp set command-center "$CONFIG"

echo
echo "✓ Done. Verify with: openclaw mcp list"
