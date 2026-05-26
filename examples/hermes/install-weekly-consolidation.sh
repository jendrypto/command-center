#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CRON_NAME="Command Center weekly consolidation"
CRON_SCHEDULE="${COMMAND_CENTER_WEEKLY_CRON:-0 9 * * 0}"

MESSAGE="Run Command Center weekly consolidation. Start with command_center.get_workspace. Use command_center.scan_queue_noise to find duplicate groups, stale repeats, noisy heartbeat clutter, and orphaned items. Apply clear cleanup with command_center.apply_queue_cleanup. Close obvious outcomes with outcome_status, outcome_note, and evidence. Keep core candidates scarce. Report counts and exceptions needing review."

echo "Installing Hermes cron: $CRON_NAME"
echo "  schedule: $CRON_SCHEDULE"
echo "  workdir:  $REPO_ROOT"

hermes cron create "$CRON_SCHEDULE" \
  --name "$CRON_NAME" \
  --workdir "$REPO_ROOT" \
  "$MESSAGE"

echo "Done. Verify with: hermes cron list"
echo "Trigger manually with: hermes cron run \"$CRON_NAME\""

