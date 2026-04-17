import { NextRequest, NextResponse } from 'next/server'
import {
  createConnection,
  deleteConnectionBetween,
  getDuplicateTitleGroups,
  getItemsNeedingAttention,
  getLowConnectionBacklog,
  getOldestOpenItems,
  getRecentItems,
  getWorkspaceStats,
  Item,
  ITEM_DISPOSITIONS,
  ITEM_STATUSES,
  updateItem,
  isValidFocusArea,
} from '@/lib/db'
import { getAllConnections } from '@/lib/db'
import { markItemPromoted, promoteItem, promotionEnabled } from '@/lib/promotion'

interface ItemUpdatePayload {
  id: number
  status?: Item['status']
  disposition?: Item['disposition']
  needs_review?: boolean
  attention_reason?: string | null
  cluster_key?: string | null
  duplicate_of?: number | null
  promotion_target?: string | null
  focus_area?: string
  focus_score?: number | null
  reviewed_at?: string
  agent_confidence?: number | null
}

interface ConnectionPayload {
  source_id: number
  target_id: number
  relationship_type?: string
}

interface PromotionPayload {
  item_id: number
  target?: string
}

function inferDisposition(status?: Item['status']): Item['disposition'] | null {
  switch (status) {
    case 'clustered':
      return 'connect_cluster'
    case 'candidate':
      return 'keep_incubating'
    case 'promoted':
      return 'promote'
    case 'reference':
      return 'reference'
    case 'archived':
      return 'archive'
    default:
      return null
  }
}

export async function GET() {
  try {
    const [stats, recent, attention, duplicates, oldestOpen, lowConnectionBacklog, connections] = await Promise.all([
      getWorkspaceStats(),
      getRecentItems(),
      getItemsNeedingAttention(),
      getDuplicateTitleGroups(),
      getOldestOpenItems(),
      getLowConnectionBacklog(),
      getAllConnections(),
    ])

    return NextResponse.json({
      stats,
      recent: recent.slice(0, 12),
      attention: attention.slice(0, 16),
      duplicates,
      oldest_open: oldestOpen,
      low_connection_backlog: lowConnectionBacklog,
      connections,
      generated_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error building agent workspace snapshot:', error)
    return NextResponse.json({ error: 'Failed to build agent workspace snapshot' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const updates = Array.isArray(body.updates) ? (body.updates as ItemUpdatePayload[]) : []
    const connections = Array.isArray(body.connections) ? (body.connections as ConnectionPayload[]) : []
    const disconnects = Array.isArray(body.disconnects) ? (body.disconnects as ConnectionPayload[]) : []
    const promotions = Array.isArray(body.promotions) ? (body.promotions as PromotionPayload[]) : []

    const updateResults: Array<{ id: number; success: boolean; item: Item | null }> = []
    const connectionResults: any[] = []
    const disconnectResults: any[] = []
    const promotionResults: any[] = []

    for (const update of updates) {
      const normalized = normalizeUpdate(update)
      validateUpdate(normalized)
      const item = await updateItem(update.id, {
        status: normalized.status,
        disposition: normalized.disposition ?? null,
        needs_review: normalized.needs_review,
        attention_reason: normalized.attention_reason ?? null,
        cluster_key: normalized.cluster_key ?? null,
        duplicate_of: normalized.duplicate_of ?? null,
        promotion_target: normalized.promotion_target ?? null,
        focus_area: normalized.focus_area,
        focus_score: normalized.focus_score ?? undefined,
        reviewed_at: normalized.reviewed_at || new Date().toISOString(),
        agent_confidence: normalized.agent_confidence ?? null,
      })
      updateResults.push({ id: update.id, success: Boolean(item), item })
    }

    for (const connection of connections) {
      if (!connection.source_id || !connection.target_id || connection.source_id === connection.target_id) {
        connectionResults.push({ ...connection, success: false, error: 'invalid connection payload' })
        continue
      }
      try {
        const created = await createConnection({
          source_id: connection.source_id,
          target_id: connection.target_id,
          relationship_type: connection.relationship_type || 'related',
        })
        connectionResults.push({ ...connection, success: true, connection: created })
      } catch (error: any) {
        connectionResults.push({ ...connection, success: false, error: error?.message || 'failed to create connection' })
      }
    }

    for (const disconnect of disconnects) {
      const success = await deleteConnectionBetween(disconnect.source_id, disconnect.target_id)
      disconnectResults.push({ ...disconnect, success })
    }

    const promotionsEnabled = promotionEnabled()

    for (const promotion of promotions) {
      if (!promotionsEnabled) {
        promotionResults.push({
          ...promotion,
          success: false,
          error: 'Promotion disabled in command-space.config.ts',
        })
        continue
      }

      const item = updateResults.find((result) => result.id === promotion.item_id)?.item
      if (!item) {
        promotionResults.push({ ...promotion, success: false, error: 'item unavailable for promotion' })
        continue
      }

      const result = await promoteItem(item, promotion.target)
      if (result.success) {
        await markItemPromoted(item.id, result.target)
      }
      promotionResults.push({
        ...promotion,
        success: result.success,
        error: result.error,
        external_id: result.externalId,
      })
    }

    return NextResponse.json({
      success: true,
      summary: {
        updated: updateResults.filter((result) => result.success).length,
        connected: connectionResults.filter((result) => result.success).length,
        disconnected: disconnectResults.filter((result) => result.success).length,
        promoted: promotionResults.filter((result) => result.success).length,
      },
      updates: updateResults,
      connections: connectionResults,
      disconnects: disconnectResults,
      promotions: promotionResults,
    })
  } catch (error) {
    console.error('Error applying agent workspace changes:', error)
    return NextResponse.json(
      { error: 'Failed to apply agent workspace changes', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

function validateUpdate(update: ItemUpdatePayload) {
  if (update.status && !ITEM_STATUSES.includes(update.status)) {
    throw new Error(`invalid status: ${update.status}`)
  }
  if (update.disposition && !ITEM_DISPOSITIONS.includes(update.disposition)) {
    throw new Error(`invalid disposition: ${update.disposition}`)
  }
  if (update.focus_area && !isValidFocusArea(update.focus_area)) {
    throw new Error(`invalid focus area: ${update.focus_area}`)
  }
}

function normalizeUpdate(update: ItemUpdatePayload): ItemUpdatePayload {
  const disposition = update.disposition && ITEM_DISPOSITIONS.includes(update.disposition)
    ? update.disposition
    : inferDisposition(update.status)

  return {
    ...update,
    disposition,
  }
}
