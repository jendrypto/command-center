import { NextRequest, NextResponse } from 'next/server'
import { updateItem, deleteItem } from '@/lib/db'

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

    // Validate allowed update fields
    const allowedFields = [
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
    ]
    const invalidFields = Object.keys(updates).filter(key => !allowedFields.includes(key))
    
    if (invalidFields.length > 0) {
      return NextResponse.json(
        { error: `Invalid update fields: ${invalidFields.join(', ')}. Allowed: ${allowedFields.join(', ')}` },
        { status: 400 }
      )
    }

    // Update all items
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
    console.error('Error in bulk update:', error)
    return NextResponse.json(
      { error: 'Failed to perform bulk update', details: error instanceof Error ? error.message : 'Unknown error' },
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
      { error: 'Failed to perform bulk delete', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
