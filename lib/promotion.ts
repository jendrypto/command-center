/**
 * Promotion adapter — dispatches to whatever external system is configured
 * in command-space.config.ts under `promotionTarget`.
 *
 * The default is a webhook adapter that POSTs the item payload to a URL. Users
 * can point it at n8n, Zapier, Pipedream, Make, or any custom endpoint. To
 * integrate with a specific downstream system (Notion, Linear, a Kanban
 * board, etc.), either write a webhook receiver on the other side or fork
 * this file and add a new case to the union in command-space.config.ts.
 */

import config from '@/command-space.config'
import { Item, updateItem } from './db'

export interface PromotionResult {
  success: boolean
  error?: string
  externalId?: string
  target?: string
}

export function promotionEnabled(): boolean {
  return config.promotionTarget.type !== 'none'
}

export async function promoteItem(
  item: Item,
  target?: string
): Promise<PromotionResult> {
  const promotionTarget = config.promotionTarget

  if (promotionTarget.type === 'none') {
    return {
      success: false,
      error: 'Promotion is disabled. Set `promotionTarget.type` to "webhook" in command-space.config.ts to enable it.',
    }
  }

  if (promotionTarget.type === 'webhook') {
    if (!promotionTarget.url) {
      return {
        success: false,
        error: 'Webhook URL is not configured. Set PROMOTION_WEBHOOK_URL in your .env file.',
      }
    }

    try {
      const response = await fetch(promotionTarget.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(promotionTarget.headers ?? {}),
        },
        body: JSON.stringify({
          item: {
            id: item.id,
            title: item.title,
            content: item.content,
            category: item.category,
            tags: item.tags,
            focus_area: item.focus_area,
            summary: item.summary ?? null,
          },
          target: target ?? 'default',
          promoted_at: new Date().toISOString(),
        }),
      })

      if (!response.ok) {
        const body = await response.text()
        return {
          success: false,
          error: `Webhook returned ${response.status}: ${body.slice(0, 200)}`,
          target,
        }
      }

      const data = await response.json().catch(() => ({}))
      return {
        success: true,
        externalId: typeof data?.id === 'string' ? data.id : undefined,
        target,
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Webhook call failed',
        target,
      }
    }
  }

  // Exhaustiveness — future union members land here.
  return { success: false, error: 'Unknown promotion target type' }
}

export async function markItemPromoted(
  itemId: number,
  target?: string
): Promise<void> {
  await updateItem(itemId, {
    status: 'promoted',
    disposition: 'promote',
    promotion_target: target ?? null,
    reviewed_at: new Date().toISOString(),
    needs_review: false,
    attention_reason: null,
  })
}
