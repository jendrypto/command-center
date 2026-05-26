import { NextRequest, NextResponse } from 'next/server'
import {
  getItemById,
  inferFocusScore,
  isValidFocusArea,
  ITEM_CATEGORIES,
  ITEM_DISPOSITIONS,
  ITEM_STATUSES,
  OUTCOME_STATUSES,
  updateItem,
  deleteItem,
} from '@/lib/db'

interface RouteContext {
  params: Promise<{
    id: string
  }>
}

function parseId(rawId: string) {
  const id = Number.parseInt(rawId, 10)
  return Number.isFinite(id) ? id : null
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id: rawId } = await context.params
    const id = parseId(rawId)

    if (!id) {
      return NextResponse.json({ error: 'Invalid item id' }, { status: 400 })
    }

    const item = await getItemById(id)

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    return NextResponse.json({ item })
  } catch (error) {
    console.error('Error fetching item by id:', error)
    return NextResponse.json({ error: 'Failed to fetch item' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id: rawId } = await context.params
    const id = parseId(rawId)

    if (!id) {
      return NextResponse.json({ error: 'Invalid item id' }, { status: 400 })
    }

    const updates = await request.json()

    if (updates.content && typeof updates.content !== 'string') {
      updates.content = JSON.stringify(updates.content)
    }

    delete updates.id
    delete updates.autoAnalyze

    if (updates.status && !ITEM_STATUSES.includes(updates.status)) {
      return NextResponse.json({ error: `Invalid status: ${updates.status}` }, { status: 400 })
    }

    if (updates.category && !ITEM_CATEGORIES.includes(updates.category)) {
      return NextResponse.json({ error: `Invalid category: ${updates.category}` }, { status: 400 })
    }

    if (updates.disposition && !ITEM_DISPOSITIONS.includes(updates.disposition)) {
      return NextResponse.json({ error: `Invalid disposition: ${updates.disposition}` }, { status: 400 })
    }

    if (updates.focus_area && !isValidFocusArea(updates.focus_area)) {
      return NextResponse.json({ error: `Invalid focus_area: ${updates.focus_area}` }, { status: 400 })
    }

    if (updates.outcome_status && !OUTCOME_STATUSES.includes(updates.outcome_status)) {
      return NextResponse.json({ error: `Invalid outcome_status: ${updates.outcome_status}` }, { status: 400 })
    }

    if (updates.focus_area && updates.focus_score === undefined) {
      updates.focus_score = inferFocusScore(updates.focus_area)
    }

    const item = await updateItem(id, updates)

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    return NextResponse.json({ item })
  } catch (error) {
    console.error('Error updating item by id:', error)
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id: rawId } = await context.params
    const id = parseId(rawId)

    if (!id) {
      return NextResponse.json({ error: 'Invalid item id' }, { status: 400 })
    }

    const success = await deleteItem(id)

    if (!success) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting item by id:', error)
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 })
  }
}
