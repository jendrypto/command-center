import { NextRequest, NextResponse } from 'next/server'
import {
  createConnection,
  deleteConnectionBetween,
  getDuplicateTitleGroups,
  getItemsNeedingAttention,
  getItemById,
  getLowConnectionBacklog,
  getOldestOpenItems,
  getRecentItems,
  getWorkspaceStats,
  Item,
  ITEM_DISPOSITIONS,
  ITEM_STATUSES,
  OUTCOME_STATUSES,
  updateItem,
  isValidFocusArea,
} from '@/lib/db'
import { getAllConnections } from '@/lib/db'
import { markItemPromoted, promoteItem, promotionEnabled } from '@/lib/promotion'
import { devDetails } from '@/lib/api-errors'

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
  owner?: string | null
  revisit_at?: string | null
  decision_needed?: string | null
  outcome_status?: Item['outcome_status']
  outcome_note?: string | null
  evidence?: string | null
  superseded_by?: number | null
  execution_target?: string | null
  execution_ref?: string | null
  execution_url?: string | null
}

interface ConnectionPayload {
  source_id: number
  target_id: number
  relationship_type?: string
}

interface PromotionPayload {
  item_id: number
  target?: string
  external_ref?: string | null
  external_url?: string | null
  owner?: string | null
  evidence?: string | null
}

interface PlanItem {
  item_id: number
  plan_title: string
  line_number: number
  text: string
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
      active_plan_items: extractActivePlanItems([...recent, ...attention]),
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
        owner: normalized.owner ?? null,
        revisit_at: normalized.revisit_at ?? null,
        decision_needed: normalized.decision_needed ?? null,
        outcome_status: normalized.outcome_status ?? null,
        outcome_note: normalized.outcome_note ?? null,
        evidence: normalized.evidence ?? null,
        superseded_by: normalized.superseded_by ?? null,
        execution_target: normalized.execution_target ?? null,
        execution_ref: normalized.execution_ref ?? null,
        execution_url: normalized.execution_url ?? null,
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

      const item = updateResults.find((result) => result.id === promotion.item_id)?.item ?? await getItemById(promotion.item_id)
      if (!item) {
        promotionResults.push({ ...promotion, success: false, error: 'item unavailable for promotion' })
        continue
      }

      const result = await promoteItem(item, promotion.target)
      if (result.success) {
        await markItemPromoted(item.id, result.target)
        const promotedItem = await updateItem(item.id, {
          execution_target: result.target ?? promotion.target ?? null,
          execution_ref: promotion.external_ref ?? result.externalId ?? null,
          execution_url: promotion.external_url ?? null,
          owner: promotion.owner ?? null,
          evidence: promotion.evidence ?? null,
          outcome_status: 'open',
          reviewed_at: new Date().toISOString(),
          needs_review: false,
          attention_reason: null,
        })
        promotionResults.push({
          ...promotion,
          success: true,
          error: null,
          external_id: result.externalId,
          item: promotedItem,
        })
        continue
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
      { error: 'Failed to apply agent workspace changes', details: devDetails(error) },
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
  if (update.outcome_status && !OUTCOME_STATUSES.includes(update.outcome_status)) {
    throw new Error(`invalid outcome status: ${update.outcome_status}`)
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

function extractActivePlanItems(items: Item[]): PlanItem[] {
  const seen = new Set<number>()
  const plans: Item[] = []

  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)

    if (!/daily plan/i.test(item.title)) continue
    if (item.status === 'archived' || item.status === 'promoted') continue
    plans.push(item)
  }

  const latestPlan = plans.sort((a, b) => {
    const createdDiff = timestamp(b.created_at) - timestamp(a.created_at)
    if (createdDiff !== 0) return createdDiff
    return timestamp(b.updated_at) - timestamp(a.updated_at)
  })[0]

  if (!latestPlan) return []

  const planItems: PlanItem[] = []
  const lines = latestPlan.content.split(/\r?\n/)
  lines.forEach((line) => {
    const match = line.trim().match(/^(\d+)[.)]\s+(.+)/)
    if (!match) return
    planItems.push({
      item_id: latestPlan.id,
      plan_title: latestPlan.title,
      line_number: Number(match[1]),
      text: match[2].trim(),
    })
  })

  return planItems.slice(0, 20)
}

function timestamp(value?: string | null): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}
