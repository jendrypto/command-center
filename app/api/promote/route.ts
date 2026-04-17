import { NextRequest, NextResponse } from 'next/server'
import { getItemById } from '@/lib/db'
import { markItemPromoted, promoteItem, promotionEnabled } from '@/lib/promotion'

/**
 * POST /api/promote
 *
 * Promote an item to whatever external system is configured in
 * command-space.config.ts under `promotionTarget`. Input: `{ item_id, target? }`.
 * On success, the item is marked as promoted in the local DB.
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

    const item = await getItemById(parseInt(item_id, 10))
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

    return NextResponse.json({
      success: true,
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
