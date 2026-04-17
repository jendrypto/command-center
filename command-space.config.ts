/**
 * Command Space — per-install configuration.
 *
 * Edit this file for your install. States, dispositions, metadata fields,
 * and dashboard layout are product-level decisions and live in the code.
 * If you need to change those, fork the repo.
 *
 * Anything secret (webhook tokens, API keys) belongs in `.env`, not here.
 */

export type FocusArea = {
  /** Stable id used in the database (lowercase, no spaces). */
  id: string;
  /** Human-readable label shown in the dashboard. */
  label: string;
  /** Tailwind-compatible hex for accents. */
  color: string;
  /**
   * Priority score applied to items landing in this lane. Higher = surfaces
   * earlier in the operator dashboard. Leave out for a sensible default.
   */
  priority?: number;
};

export type PromotionTarget =
  /**
   * Post promoted items to an external webhook. Works with n8n, Zapier,
   * Pipedream, Make, or any endpoint that accepts JSON.
   */
  | {
      type: "webhook";
      url: string;
      headers?: Record<string, string>;
    }
  /**
   * Disable external promotion. Items still reach `promoted` state internally
   * but nothing is pushed anywhere.
   */
  | { type: "none" };

export type CommandSpaceConfig = {
  agent: {
    /** What the agent calls itself. Appears in the dashboard UI. */
    name: string;
    /** One-line description of what this space is for. */
    purpose: string;
  };

  /**
   * Strategic lanes items get sorted into. Keep it to 2–5. More than that
   * becomes noise. The first entry is the default lane for new captures
   * whose lane can't be inferred.
   */
  focusAreas: FocusArea[];

  /** Where items go when the agent promotes them. */
  promotionTarget: PromotionTarget;

  dashboard: {
    /** Top-of-page title. Rebrand if you want. */
    title: string;
  };
};

const config: CommandSpaceConfig = {
  agent: {
    name: "Scout",
    purpose: "Capture, cluster, and surface the work that matters.",
  },

  focusAreas: [
    { id: "work", label: "Work", color: "#6c2bee", priority: 100 },
    { id: "personal", label: "Personal", color: "#00f0ff", priority: 80 },
    { id: "later", label: "Later", color: "#6b7280", priority: 10 },
  ],

  promotionTarget: {
    type: "webhook",
    url: process.env.PROMOTION_WEBHOOK_URL ?? "",
    headers: process.env.PROMOTION_WEBHOOK_TOKEN
      ? { Authorization: `Bearer ${process.env.PROMOTION_WEBHOOK_TOKEN}` }
      : undefined,
  },

  dashboard: {
    title: "Command Center",
  },
};

export default config;
