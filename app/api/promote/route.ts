import { NextRequest, NextResponse } from 'next/server'
import { getItemById, OUTCOME_STATUSES, updateItem } from '@/lib/db'
import { markItemPromoted, promoteItem, promotionEnabled } from '@/lib/promotion'

/**
 * POST /api/promote
 *
 * Promote an item to whatever external system is configured in
 * command-space.config.ts under `promotionTarget`.
 * Input: `{ item_id, target?, owner?, external_ref?, external_url?, evidence? }`.
 * On success, the item is marked as promoted and handoff metadata is stored.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { item_id, target } = body

    if (!item_id) {
      return NextResponse.json(
        { error: 'Missing required field: item_id' },
        { status: 400 }
      )
    }

    if (!promotionEnabled()) {
      return NextResponse.json(
        {
          error:
            'Promotion is disabled. Set `promotionTarget.type` to "webhook" in command-space.config.ts to enable it.',
        },
        { status: 400 }
      )
    }

    const parsedId = Number.parseInt(String(item_id), 10)
    if (!Number.isFinite(parsedId)) {
      return NextResponse.json({ error: 'Invalid item_id' }, { status: 400 })
    }
    if (body.outcome_status && !OUTCOME_STATUSES.includes(body.outcome_status)) {
      return NextResponse.json({ error: `Invalid outcome_status: ${body.outcome_status}` }, { status: 400 })
    }
    const item = await getItemById(parsedId)
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const result = await promoteItem(item, target)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Promotion failed' },
        { status: 502 }
      )
    }

    await markItemPromoted(item.id, result.target)
    const updated = await updateItem(item.id, {
      execution_target: result.target ?? target ?? null,
      execution_ref: body.external_ref ?? result.externalId ?? null,
      execution_url: body.external_url ?? null,
      owner: body.owner || null,
      evidence: body.evidence || null,
      outcome_status: body.outcome_status || 'open',
      needs_review: false,
      attention_reason: null,
      reviewed_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      command_center_item: updated,
      item_id: item.id,
      external_id: result.externalId ?? null,
      target: result.target ?? null,
    })
  } catch (error) {
    console.error('Error promoting item:', error)
    return NextResponse.json(
      {
        error: 'Failed to promote item',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
