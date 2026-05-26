import { NextRequest, NextResponse } from 'next/server'
import {
  createItem,
  getAllItems,
  inferFocusArea,
  inferFocusScore,
  updateItem,
  deleteItem,
  searchItems,
  getItemsByStatus,
  getItemsByCategory,
  getStaleItems,
  getRecentItems,
  getItemsNeedingAttention,
  getConnectionCount,
  Item,
  ITEM_CATEGORIES,
  ITEM_DISPOSITIONS,
  ITEM_STATUSES,
  OUTCOME_STATUSES,
  isValidFocusArea,
} from '@/lib/db'
import { getAgentName } from '@/lib/config'
import { summarizeContent, autoTagContent } from '@/lib/ai'
import { events } from '@/lib/events'

// GET /api/items - List all items or search
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const status = searchParams.get('status') as Item['status'] | null
    const category = searchParams.get('category') as Item['category'] | null
    const filter = searchParams.get('filter')
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? Number(limitParam) : undefined

    let items: Item[]

    if (query) {
      items = await searchItems(query)
    } else if (status) {
      items = await getItemsByStatus(status)
    } else if (category) {
      items = await getItemsByCategory(category)
    } else if (filter === 'stale') {
      items = await getStaleItems()
    } else if (filter === 'recent') {
      items = await getRecentItems()
    } else if (filter === 'attention') {
      items = await getItemsNeedingAttention()
    } else {
      items = await getAllItems(limit && Number.isFinite(limit) ? limit : undefined)
    }

    const itemsWithConnections = await Promise.all(
      items.map(async (item) => ({
        ...item,
        connectionCount: await getConnectionCount(item.id),
      }))
    )

    return NextResponse.json({ items: itemsWithConnections })
  } catch (error) {
    console.error('Error fetching items:', error)
    return NextResponse.json(
      { error: 'Failed to fetch items' },
      { status: 500 }
    )
  }
}

// Length limits on user-supplied strings. The dashboard renders them unpaged
// in a few places; without limits, one bad row can stall the UI and blow up
// response payloads. Adjust in a fork if your agent captures longer bodies.
const MAX_TITLE_LEN = 500
const MAX_CONTENT_LEN = 100_000
const MAX_SUMMARY_LEN = 2_000
const MAX_ATTENTION_REASON_LEN = 1_000

function tooLong(value: unknown, limit: number): boolean {
  return typeof value === 'string' && value.length > limit
}

// POST /api/items - Create new item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, content, category, status = 'raw', autoAnalyze = true } = body

    if (!title || !content || !category) {
      return NextResponse.json(
        { error: 'Missing required fields: title, content, category' },
        { status: 400 }
      )
    }

    if (tooLong(title, MAX_TITLE_LEN)) {
      return NextResponse.json({ error: `title exceeds ${MAX_TITLE_LEN} chars` }, { status: 400 })
    }
    const contentForLenCheck = typeof content === 'string' ? content : JSON.stringify(content)
    if (tooLong(contentForLenCheck, MAX_CONTENT_LEN)) {
      return NextResponse.json({ error: `content exceeds ${MAX_CONTENT_LEN} chars` }, { status: 400 })
    }
    if (tooLong(body.summary, MAX_SUMMARY_LEN)) {
      return NextResponse.json({ error: `summary exceeds ${MAX_SUMMARY_LEN} chars` }, { status: 400 })
    }
    if (tooLong(body.attention_reason, MAX_ATTENTION_REASON_LEN)) {
      return NextResponse.json({ error: `attention_reason exceeds ${MAX_ATTENTION_REASON_LEN} chars` }, { status: 400 })
    }

    if (!ITEM_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category: ${category}` },
        { status: 400 }
      )
    }

    if (!ITEM_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status: ${status}` },
        { status: 400 }
      )
    }

    if (body.focus_area && !isValidFocusArea(body.focus_area)) {
      return NextResponse.json(
        { error: `Invalid focus_area: ${body.focus_area}` },
        { status: 400 }
      )
    }

    if (body.outcome_status && !OUTCOME_STATUSES.includes(body.outcome_status)) {
      return NextResponse.json(
        { error: `Invalid outcome_status: ${body.outcome_status}` },
        { status: 400 }
      )
    }

    const contentStr = typeof content === 'string' ? content : JSON.stringify(content)

    let tags: string[] = body.tags || []
    let summary: string | undefined = body.summary

    if (autoAnalyze) {
      const autoTags = autoTagContent(title, contentStr)
      tags = Array.from(new Set([...tags, ...autoTags]))

      if (contentStr.length > 200) {
        summary = await summarizeContent(contentStr)
      }
    }

    const needsReview = body.needs_review !== undefined ? Boolean(body.needs_review) : status === 'raw'
    const attentionReason = body.attention_reason !== undefined
      ? body.attention_reason
      : needsReview
        ? `New capture awaiting ${getAgentName()} triage`
        : null

    const item = await createItem({
      title,
      content: contentStr,
      category,
      tags,
      status,
      summary,
      reviewed_at: body.reviewed_at || null,
      agent_confidence: body.agent_confidence ?? null,
      disposition: body.disposition || null,
      duplicate_of: body.duplicate_of ?? null,
      cluster_key: body.cluster_key || null,
      promotion_target: body.promotion_target || null,
      needs_review: needsReview,
      attention_reason: attentionReason,
      focus_area: body.focus_area || inferFocusArea(title, contentStr, tags),
      focus_score: body.focus_score ?? inferFocusScore(body.focus_area || inferFocusArea(title, contentStr, tags)),
      owner: body.owner || null,
      revisit_at: body.revisit_at || null,
      decision_needed: body.decision_needed || null,
      outcome_status: body.outcome_status || null,
      outcome_note: body.outcome_note || null,
      evidence: body.evidence || null,
      superseded_by: body.superseded_by ?? null,
      execution_target: body.execution_target || null,
      execution_ref: body.execution_ref || null,
      execution_url: body.execution_url || null,
    })

    events.emit('new-item', item)

    return NextResponse.json({ item }, { status: 201 })
  } catch (error) {
    console.error('Error creating item:', error)
    return NextResponse.json(
      { error: 'Failed to create item' },
      { status: 500 }
    )
  }
}

// PUT /api/items - Update item
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      )
    }

    if (updates.content && typeof updates.content !== 'string') {
      updates.content = JSON.stringify(updates.content)
    }

    if (tooLong(updates.title, MAX_TITLE_LEN)) {
      return NextResponse.json({ error: `title exceeds ${MAX_TITLE_LEN} chars` }, { status: 400 })
    }
    if (tooLong(updates.content, MAX_CONTENT_LEN)) {
      return NextResponse.json({ error: `content exceeds ${MAX_CONTENT_LEN} chars` }, { status: 400 })
    }
    if (tooLong(updates.summary, MAX_SUMMARY_LEN)) {
      return NextResponse.json({ error: `summary exceeds ${MAX_SUMMARY_LEN} chars` }, { status: 400 })
    }
    if (tooLong(updates.attention_reason, MAX_ATTENTION_REASON_LEN)) {
      return NextResponse.json({ error: `attention_reason exceeds ${MAX_ATTENTION_REASON_LEN} chars` }, { status: 400 })
    }

    if (updates.content && updates.autoAnalyze) {
      const autoTags = autoTagContent(updates.title || '', updates.content)
      updates.tags = Array.from(new Set([...(updates.tags || []), ...autoTags]))

      if (updates.content.length > 200) {
        updates.summary = await summarizeContent(updates.content)
      }
    }

    delete updates.autoAnalyze

    if (updates.status && !ITEM_STATUSES.includes(updates.status)) {
      return NextResponse.json(
        { error: `Invalid status: ${updates.status}` },
        { status: 400 }
      )
    }

    if (updates.category && !ITEM_CATEGORIES.includes(updates.category)) {
      return NextResponse.json(
        { error: `Invalid category: ${updates.category}` },
        { status: 400 }
      )
    }

    if (updates.disposition && !ITEM_DISPOSITIONS.includes(updates.disposition)) {
      return NextResponse.json(
        { error: `Invalid disposition: ${updates.disposition}` },
        { status: 400 }
      )
    }

    if (updates.focus_area && !isValidFocusArea(updates.focus_area)) {
      return NextResponse.json(
        { error: `Invalid focus_area: ${updates.focus_area}` },
        { status: 400 }
      )
    }

    if (updates.outcome_status && !OUTCOME_STATUSES.includes(updates.outcome_status)) {
      return NextResponse.json(
        { error: `Invalid outcome_status: ${updates.outcome_status}` },
        { status: 400 }
      )
    }

    if (updates.focus_area && updates.focus_score === undefined) {
      updates.focus_score = inferFocusScore(updates.focus_area)
    }

    const item = await updateItem(id, updates)

    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ item })
  } catch (error) {
    console.error('Error updating item:', error)
    return NextResponse.json(
      { error: 'Failed to update item' },
      { status: 500 }
    )
  }
}

// DELETE /api/items?id=X - Delete item
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required parameter: id' },
        { status: 400 }
      )
    }

    const parsed = Number.parseInt(id, 10)
    if (!Number.isFinite(parsed)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }
    const success = await deleteItem(parsed)

    if (!success) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting item:', error)
    return NextResponse.json(
      { error: 'Failed to delete item' },
      { status: 500 }
    )
  }
}
