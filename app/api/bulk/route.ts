import { NextRequest, NextResponse } from 'next/server'
import {
  updateItem,
  deleteItem,
  isValidFocusArea,
  ITEM_CATEGORIES,
  ITEM_DISPOSITIONS,
  ITEM_STATUSES,
} from '@/lib/db'
import { devDetails } from '@/lib/api-errors'

const ALLOWED_BULK_FIELDS = [
  'title',
  'content',
  'category',
  'tags',
  'status',
  'summary',
  'reviewed_at',
  'agent_confidence',
  'disposition',
  'duplicate_of',
  'cluster_key',
  'promotion_target',
  'needs_review',
  'attention_reason',
  'focus_area',
  'focus_score',
] as const

// Same validation as POST/PUT /api/items — applied to the single `updates`
// object that bulk PUT broadcasts across all target ids.
function validateBulkUpdates(updates: Record<string, unknown>): string | null {
  if (updates.status !== undefined && !ITEM_STATUSES.includes(updates.status as any)) {
    return `invalid status: ${updates.status}`
  }
  if (updates.category !== undefined && !ITEM_CATEGORIES.includes(updates.category as any)) {
    return `invalid category: ${updates.category}`
  }
  if (updates.disposition !== undefined && updates.disposition !== null && !ITEM_DISPOSITIONS.includes(updates.disposition as any)) {
    return `invalid disposition: ${updates.disposition}`
  }
  if (updates.focus_area !== undefined && !isValidFocusArea(updates.focus_area as string)) {
    return `invalid focus_area: ${updates.focus_area}`
  }
  return null
}

// POST /api/bulk/update - Update multiple items at once
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { ids, updates } = body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: ids (array of item IDs)' },
        { status: 400 }
      )
    }

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json(
        { error: 'Missing required field: updates (object with fields to update)' },
        { status: 400 }
      )
    }

    const invalidFields = Object.keys(updates).filter((key) => !ALLOWED_BULK_FIELDS.includes(key as any))

    if (invalidFields.length > 0) {
      return NextResponse.json(
        { error: `Invalid update fields: ${invalidFields.join(', ')}. Allowed: ${ALLOWED_BULK_FIELDS.join(', ')}` },
        { status: 400 }
      )
    }

    const enumError = validateBulkUpdates(updates)
    if (enumError) {
      return NextResponse.json({ error: enumError }, { status: 400 })
    }

    const results = await Promise.all(
      ids.map(async (id: number) => {
        try {
          const item = await updateItem(id, updates)
          return { id, success: !!item, error: item ? null : 'Item not found' }
        } catch (error) {
          return { id, success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
      })
    )

    const succeeded = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success)

    return NextResponse.json({
      success: true,
      summary: {
        total: ids.length,
        succeeded,
        failed: failed.length,
      },
      results,
    })
  } catch (error) {
    console.error('Error in bulk update:', error)
    return NextResponse.json(
      { error: 'Failed to perform bulk update', details: devDetails(error) },
      { status: 500 }
    )
  }
}

// DELETE /api/bulk/delete - Delete multiple items at once
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { ids } = body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: ids (array of item IDs)' },
        { status: 400 }
      )
    }

    // Delete all items
    const results = await Promise.all(
      ids.map(async (id: number) => {
        try {
          const success = await deleteItem(id)
          return { id, success, error: success ? null : 'Item not found' }
        } catch (error) {
          return { id, success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
      })
    )

    const succeeded = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success)

    return NextResponse.json({
      success: true,
      summary: {
        total: ids.length,
        succeeded,
        failed: failed.length
      },
      results
    })

  } catch (error) {
    console.error('Error in bulk delete:', error)
    return NextResponse.json(
      { error: 'Failed to perform bulk delete', details: devDetails(error) },
      { status: 500 }
    )
  }
}
