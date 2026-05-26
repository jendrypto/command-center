#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CRON_NAME="Command Center daily triage"
CRON_SCHEDULE="${COMMAND_CENTER_DAILY_CRON:-0 8 * * 1-5}"

MESSAGE="Run a Command Center triage pass. Start with command_center.get_workspace for the full snapshot. Review active_plan_items, attention items, duplicates, due reviews, and open outcomes. Batch all clear mutations into one command_center.update_items call. Connect related items when useful. Promote only when a next action is real and include handoff metadata only when an external reference exists. Report under 200 words and surface only exceptions needing human review."

echo "Installing Hermes cron: $CRON_NAME"
echo "  schedule: $CRON_SCHEDULE"
echo "  workdir:  $REPO_ROOT"

hermes cron create "$CRON_SCHEDULE" \
  --name "$CRON_NAME" \
  --workdir "$REPO_ROOT" \
  "$MESSAGE"

echo "Done. Verify with: hermes cron list"
echo "Trigger manually with: hermes cron run \"$CRON_NAME\""

