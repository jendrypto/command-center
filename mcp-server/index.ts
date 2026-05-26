#!/usr/bin/env node
/**
 * Command Center MCP Server
 *
 * Thin stdio bridge that exposes the Command Center REST API as MCP tools.
 * Agents (Hermes, OpenClaw, Claude Code, Claude Desktop, Cursor, etc.) connect over
 * stdio and can read the workspace, update items, promote, and run cleanup.
 *
 * Registration with an MCP-aware runtime:
 *   hermes mcp add command-center \
 *     --command node \
 *     --args /abs/path/to/command-center/mcp-server/dist/index.js \
 *     --env COMMAND_CENTER_URL=http://localhost:3005
 *
 *   openclaw mcp set command-center \
 *     '{"command":"node","args":["/abs/path/to/command-center/mcp-server/dist/index.js"],"env":{"COMMAND_CENTER_URL":"http://localhost:3005"}}'
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = process.env.COMMAND_CENTER_URL ?? "http://localhost:3005";

async function callApi<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

const server = new McpServer(
  { name: "command-center", version: "0.1.0" },
  {
    instructions:
      "Start each triage pass with get_workspace. Batch all writes into a " +
      "single update_items call. Only promote items that have a clear owner " +
      "and a clear next action. For weekly consolidation, use scan_queue_noise " +
      "followed by apply_queue_cleanup — do not run these on every pass.",
  },
);

/* ── Read tools ─────────────────────────────────────────────────────────── */

server.registerTool(
  "get_workspace",
  {
    description:
      "Full workspace snapshot: stats, recent items, attention queue, duplicate groups, oldest open, low-connection backlog, and existing connections. Call this first in every triage pass.",
    inputSchema: z.object({}).shape,
  },
  async () => textResult(await callApi("/api/agent")),
);

server.registerTool(
  "get_attention",
  {
    description:
      "Just the items currently flagged as needing review. Convenience wrapper over get_workspace.attention.",
    inputSchema: z.object({
      limit: z.number().int().positive().optional(),
    }).shape,
  },
  async ({ limit }) => {
    const data = await callApi<{ attention: unknown[] }>("/api/agent");
    const items = limit ? data.attention.slice(0, limit) : data.attention;
    return textResult(items);
  },
);

server.registerTool(
  "search_items",
  {
    description:
      "Search items by text query or metadata filters (status, category, focus_area).",
    inputSchema: z.object({
      query: z.string().optional(),
      status: z.string().optional(),
      category: z.string().optional(),
      focus_area: z.string().optional(),
    }).shape,
  },
  async (filters) => {
    const params = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v != null) as [string, string][],
    );
    return textResult(await callApi(`/api/items?${params.toString()}`));
  },
);

/* ── Write tools ────────────────────────────────────────────────────────── */

const ItemUpdate = z.object({
  id: z.number().int(),
  status: z.string().optional(),
  disposition: z.string().optional(),
  needs_review: z.boolean().optional(),
  attention_reason: z.string().nullable().optional(),
  cluster_key: z.string().nullable().optional(),
  duplicate_of: z.number().int().nullable().optional(),
  promotion_target: z.string().optional(),
  focus_area: z.string().optional(),
  focus_score: z.number().optional(),
  reviewed_at: z.string().optional(),
  agent_confidence: z.number().min(0).max(1).optional(),
  owner: z.string().nullable().optional(),
  revisit_at: z.string().nullable().optional(),
  decision_needed: z.string().nullable().optional(),
  outcome_status: z.string().nullable().optional(),
  outcome_note: z.string().nullable().optional(),
  evidence: z.string().nullable().optional(),
  superseded_by: z.number().int().nullable().optional(),
  execution_target: z.string().nullable().optional(),
  execution_ref: z.string().nullable().optional(),
  execution_url: z.string().nullable().optional(),
});

server.registerTool(
  "update_items",
  {
    description:
      "Batch state/metadata updates. Prefer this over per-item calls — the API handles the whole batch atomically.",
    inputSchema: z.object({
      updates: z.array(ItemUpdate).min(1),
    }).shape,
  },
  async ({ updates }) =>
    textResult(
      await callApi("/api/agent", {
        method: "POST",
        body: JSON.stringify({ updates }),
      }),
    ),
);

server.registerTool(
  "connect_items",
  {
    description: "Create a connection between two items.",
    inputSchema: z.object({
      source_id: z.number().int(),
      target_id: z.number().int(),
      relationship_type: z.string().optional(),
    }).shape,
  },
  async (connection) =>
    textResult(
      await callApi("/api/agent", {
        method: "POST",
        body: JSON.stringify({ connections: [connection] }),
      }),
    ),
);

server.registerTool(
  "disconnect_items",
  {
    description: "Remove a connection between two items.",
    inputSchema: z.object({
      source_id: z.number().int(),
      target_id: z.number().int(),
    }).shape,
  },
  async (disconnect) =>
    textResult(
      await callApi("/api/agent", {
        method: "POST",
        body: JSON.stringify({ disconnects: [disconnect] }),
      }),
    ),
);

server.registerTool(
  "promote_items",
  {
    description:
      "Promote items to the configured promotion target (webhook by default). Sets status=promoted and pushes the item externally. Only use when the item has a clear owner and next action.",
    inputSchema: z.object({
      promotions: z
        .array(
          z.object({
            item_id: z.number().int(),
            target: z.string().optional(),
            external_ref: z.string().nullable().optional(),
            external_url: z.string().nullable().optional(),
            owner: z.string().nullable().optional(),
            evidence: z.string().nullable().optional(),
          }),
        )
        .min(1),
    }).shape,
  },
  async ({ promotions }) =>
    textResult(
      await callApi("/api/agent", {
        method: "POST",
        body: JSON.stringify({ promotions }),
      }),
    ),
);

server.registerTool(
  "capture_item",
  {
    description:
      "Create a new item in the workspace. Typically used by capture-source integrations (browser extension, CLI, email-in), not during agent triage.",
    inputSchema: z.object({
      title: z.string(),
      content: z.string().optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).optional(),
      status: z.string().optional(),
      focus_area: z.string().optional(),
      owner: z.string().nullable().optional(),
      revisit_at: z.string().nullable().optional(),
      decision_needed: z.string().nullable().optional(),
      outcome_status: z.string().nullable().optional(),
      outcome_note: z.string().nullable().optional(),
      evidence: z.string().nullable().optional(),
      execution_target: z.string().nullable().optional(),
      execution_ref: z.string().nullable().optional(),
      execution_url: z.string().nullable().optional(),
    }).shape,
  },
  async (item) =>
    textResult(
      await callApi("/api/items", {
        method: "POST",
        body: JSON.stringify(item),
      }),
    ),
);

/* ── Cleanup tools (weekly consolidation) ──────────────────────────────── */

server.registerTool(
  "scan_queue_noise",
  {
    description:
      "Report of duplicate groups, stale repeat groups, heartbeat clutter, stale items, and orphaned items. Run during weekly consolidation, not daily triage.",
    inputSchema: z.object({}).shape,
  },
  async () => textResult(await callApi("/api/queue-cleaner")),
);

server.registerTool(
  "apply_queue_cleanup",
  {
    description:
      "Apply a cleanup action: archive a duplicate group, demote heartbeat items, or bulk archive/reference/delete. Use the report from scan_queue_noise to decide what to run.",
    inputSchema: z.object({
      action: z.enum([
        "archive-duplicate-group",
        "demote-heartbeat-group",
        "archive",
        "reference",
        "delete",
      ]),
      itemIds: z.array(z.number().int()).min(1),
      primaryId: z.number().int().optional(),
    }).shape,
  },
  async (payload) =>
    textResult(
      await callApi("/api/queue-cleaner", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    ),
);

/* ── Boot ───────────────────────────────────────────────────────────────── */

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[command-center-mcp] connected to ${BASE_URL}`);
