#!/bin/bash
# Schedule the Command Center weekly consolidation cron in openclaw.
#
# Default: Sunday mornings at 9am in America/Los_Angeles. Override the
# schedule or timezone by editing the variables below.

set -euo pipefail

CRON_NAME="Command Center weekly consolidation"
CRON_SCHEDULE="${CRON_SCHEDULE:-0 9 * * 0}"
CRON_TZ="${CRON_TZ:-America/Los_Angeles}"

MESSAGE="Run Command Center weekly consolidation. Call command_center.scan_queue_noise to find duplicate groups, stale repeats, noisy heartbeats, and orphaned items. Apply command_center.apply_queue_cleanup to merge duplicate groups (archive-duplicate-group with a primaryId), demote heartbeat clutter (demote-heartbeat-group), and archive stale backlog items over 14 days old. Report counts and any exceptions that need review. No action longer than one sentence per group."

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
