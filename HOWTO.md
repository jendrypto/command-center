# HOWTO

Extending Command Center. Start from the [README](README.md) quickstart — this document is for when you need to go beyond the defaults.

## Custom promotion adapter

The default promotion target is a webhook. If you need tighter integration with a specific downstream system, fork `lib/promotion.ts` and add a new case to the `PromotionTarget` union in `command-space.config.ts`.

**1. Extend the config type.** In `command-space.config.ts`:

```ts
export type PromotionTarget =
  | { type: "webhook"; url: string; headers?: Record<string, string> }
  | { type: "none" }
  | {
      type: "notion";
      apiKey: string;
      databaseId: string;
    };
```

**2. Handle the new case in `lib/promotion.ts`:**

```ts
if (promotionTarget.type === "notion") {
  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${promotionTarget.apiKey}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { database_id: promotionTarget.databaseId },
      properties: {
        Title: { title: [{ text: { content: item.title } }] },
        Category: { select: { name: item.category } },
      },
      children: [
        { object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content: item.content } }] } },
      ],
    }),
  });
  // ...return { success, externalId, error } shape
}
```

That's the whole pattern. The rest of the app never needs to know about the new adapter — the state machine, dashboard, and agent API all keep working unchanged.

## Custom agents

The REST API at `/api/agent` is the canonical contract. MCP is just a stdio wrapper. If your agent runtime doesn't speak MCP (or you want to avoid the subprocess), point it at the REST endpoints directly.

### Triage loop

One iteration:

```
1. GET  /api/agent                   → full snapshot
2. Agent reasons over snapshot.attention + snapshot.duplicates
3. POST /api/agent  { updates, connections, disconnects, promotions }
```

### Snapshot shape (`GET /api/agent`)

```ts
{
  stats: {
    total: number;
    raw: number; clustered: number; candidate: number;
    promoted: number; reference: number; archived: number;
    needs_review: number;
    focus: Record<string, number>;    // by focus_area id
  };
  recent: Item[];                      // last 12 by created_at
  attention: Item[];                   // max 16, needs review or raw/candidate
  duplicates: Array<{ title_key, copies, item_ids }>;
  oldest_open: Item[];
  low_connection_backlog: Array<Item & { connection_count: number }>;
  connections: Connection[];
  generated_at: string;                // ISO timestamp
}
```

### Batch update shape (`POST /api/agent`)

```ts
{
  updates?: Array<{
    id: number;
    status?: "raw" | "clustered" | "candidate" | "promoted" | "reference" | "archived";
    disposition?: "keep_incubating" | "connect_cluster" | "promote" | "reference" | "archive" | "merge_duplicate";
    needs_review?: boolean;
    attention_reason?: string | null;
    cluster_key?: string | null;
    duplicate_of?: number | null;
    promotion_target?: string | null;
    focus_area?: string;               // must match a lane id in config
    focus_score?: number;
    reviewed_at?: string;
    agent_confidence?: number;         // 0–1
  }>;
  connections?: Array<{ source_id, target_id, relationship_type? }>;
  disconnects?: Array<{ source_id, target_id }>;
  promotions?: Array<{ item_id, target? }>;
}
```

Batch everything. Per-item calls work but are wasteful — the API handles arbitrary batch sizes atomically per-operation.

### Queue cleanup (`GET/POST /api/queue-cleaner`)

Run on a slower cadence (weekly) — the duplicate detection and stale scanning are O(n²) on open items.

- `GET` returns `{ duplicateGroups, staleRepeatGroups, noisyHeartbeatGroups, staleItems, orphanedItems, summary }`.
- `POST` accepts `{ action, itemIds, primaryId? }` where action is one of `archive-duplicate-group`, `demote-heartbeat-group`, `archive`, `reference`, `delete`.

## Capture sources

New items enter the workspace through `POST /api/items` with `{ title, content, category, tags?, autoAnalyze? }`. That's it — there's no plugin registry, just an endpoint anything can POST to.

Wire up whatever makes sense:

- **Browser extension**: POST from a content script on the page.
- **CLI**: `curl -X POST` wrapper; see `scripts/decision-trace.sh` for a worked example.
- **Email-in**: forwarder that parses subject → title, body → content.
- **Slack / Discord**: slash command that posts to the API.
- **iOS Shortcuts**: Share Sheet → POST.

Anything that can make an HTTPS request can capture.

## Customizing the dashboard

The dashboard is deliberately not config-driven — its sections (Today / This Week / Project lanes / Blockers / Stale / Opportunities / Pending Decisions / Pulse / Workspace state view) represent the product's opinions about what matters in a triage workspace.

If you need to change those sections: edit `app/page.tsx` directly. The logic is plain React — `useMemo` filters, typed `Item[]` arrays, no framework magic.

If you need to change lane names/colors: edit `command-space.config.ts.focusAreas`.

If you need different states/dispositions: fork the repo. Adding a new status means touching `lib/db.ts` (schema + CHECK constraints), the state machine in `app/api/agent/route.ts`, and the UI labels in `components/DetailPanel.tsx` and `components/CardView.tsx`.

## MCP tool reference

The MCP server exposes these tools over stdio:

| Tool | Wraps | Purpose |
|---|---|---|
| `get_workspace` | `GET /api/agent` | Full triage snapshot |
| `get_attention` | Filtered snapshot | Items needing review |
| `search_items` | `GET /api/items?...` | Search by query/status/category/lane |
| `update_items` | `POST /api/agent` | Batch state/metadata updates |
| `connect_items` | `POST /api/agent` | Link two items |
| `disconnect_items` | `POST /api/agent` | Unlink two items |
| `promote_items` | `POST /api/agent` | Promote to configured target |
| `capture_item` | `POST /api/items` | Create a new item |
| `scan_queue_noise` | `GET /api/queue-cleaner` | Report on duplicates/stale/heartbeats |
| `apply_queue_cleanup` | `POST /api/queue-cleaner` | Cleanup actions |

All input/output is validated by zod schemas. See `mcp-server/index.ts` for the exact shapes.

## Heartbeat (optional)

If your agent uses openclaw's `HEARTBEAT.md` for periodic checks, you can have it include a Command Center status read by adding to your workspace's `HEARTBEAT.md`:

```markdown
## Command Center pulse

On each heartbeat, call `command_center.get_workspace`. If `stats.needs_review > 5`
or any item in `attention` has been stale > 72h, surface it.
```

This is opt-in. The default cron-driven triage does not require heartbeat involvement.

## Gotchas

- **Config changes are not automatic.** If you add a new focus area, existing items with the old lane id will still display the raw id. Migrate manually: `UPDATE items SET focus_area = 'new_id' WHERE focus_area = 'old_id'`.
- **Webhook promotion swallows item content.** The full `content` field is sent. Don't put secrets in captures.
- **Queue cleaner is O(n²)** on open items. Fine for <10k items. If you're larger, run it less often or tune the Jaccard threshold in `lib/queue-cleaner.ts`.
