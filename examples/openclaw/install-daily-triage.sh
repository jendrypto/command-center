#!/bin/bash
# Schedule the Command Center daily triage cron in openclaw.
#
# Default: weekday mornings at 8am in America/Los_Angeles. Override the
# schedule or timezone by editing the variables below.
#
# The `--tools command-center` flag scopes the session to just this MCP
# server's tools. If your openclaw build doesn't support per-MCP-server
# tool scoping, drop the flag — your agent will see all its registered
# tools, which is harmless, just less clean.

set -euo pipefail

CRON_NAME="Command Center daily triage"
CRON_SCHEDULE="${CRON_SCHEDULE:-0 8 * * 1-5}"
CRON_TZ="${CRON_TZ:-America/Los_Angeles}"

MESSAGE="Run a Command Center triage pass. Start with command_center.get_workspace for the full snapshot, then process attention items, cluster related items, archive duplicates, and surface anything needing human review with a specific attention_reason. Batch all writes into a single command_center.update_items call. Digest under 200 words."

echo "Scheduling: $CRON_NAME"
echo "  cron: $CRON_SCHEDULE"
echo "  tz:   $CRON_TZ"
echo

openclaw cron add \
  --name "$CRON_NAME" \
  --cron "$CRON_SCHEDULE" \
  --tz "$CRON_TZ" \
  --session isolated \
  --tools command-center \
  --message "$MESSAGE"

echo
echo "✓ Done. Verify with: openclaw cron list"
echo "  Trigger manually with: openclaw cron run \"$CRON_NAME\""
