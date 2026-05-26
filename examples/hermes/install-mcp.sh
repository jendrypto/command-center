#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MCP_ENTRY="$REPO_ROOT/mcp-server/dist/index.js"

if [ ! -f "$MCP_ENTRY" ]; then
  echo "MCP server not built yet: $MCP_ENTRY"
  echo "Run: npm run mcp:build"
  exit 1
fi

COMMAND_CENTER_URL="${COMMAND_CENTER_URL:-http://localhost:3005}"

echo "Registering command-center MCP server with Hermes..."
echo "  entry: $MCP_ENTRY"
echo "  url:   $COMMAND_CENTER_URL"

hermes mcp add command-center \
  --command node \
  --args "$MCP_ENTRY" \
  --env "COMMAND_CENTER_URL=$COMMAND_CENTER_URL"

echo "Done. Verify with: hermes mcp list && hermes mcp test command-center"

