import { NextRequest, NextResponse } from 'next/server'
import {
  createItem,
  getAllItems,
  getItemById,
  updateItem,
  createConnection,
  getConnectionsForItem,
  Item,
} from '@/lib/db'

// Extended interface for decision trace items
interface DecisionTrace {
  id: number
  title: string
  question: string
  options_considered: string[]
  choice_made: string
  reasoning: string
  decision_date: string
  outcome?: string
  outcome_date?: string
  category: 'decisions'
  tags: string[]
  status: Item['status']
  content: string // Full formatted decision document
  created_at: string
  updated_at: string
  related_items?: number[] // IDs of connected opportunities, projects, etc.
  superseded_by?: number // If this decision was reversed/changed
}

// Parse decision content from item
function parseDecisionContent(item: Item): Partial<DecisionTrace> {
  try {
    const content = JSON.parse(item.content)
    return {
      question: content.question || '',
      options_considered: content.options_considered || [],
      choice_made: content.choice_made || '',
      reasoning: content.reasoning || '',
      decision_date: content.decision_date || item.created_at,
      outcome: content.outcome || undefined,
      outcome_date: content.outcome_date || undefined,
      superseded_by: content.superseded_by || undefined,
    }
  } catch {
    return {
      question: '',
      options_considered: [],
      choice_made: '',
      reasoning: item.content,
      decision_date: item.created_at,
    }
  }
}

// GET /api/decisions - Query decision traces
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q') // Search query
    const tag = searchParams.get('tag') // Filter by tag
    const superseded = searchParams.get('superseded') // 'true' | 'false' | 'all'
    const withOutcome = searchParams.get('outcome') // 'complete' | 'pending' | 'all'
    
    // Get all items and filter for decisions
    let allItems = await getAllItems()
    let decisions = allItems.filter(item => item.category === 'decisions')
    
    // Apply search filter
    if (q) {
      const searchLower = q.toLowerCase()
      decisions = decisions.filter(d => {
        const parsed = parseDecisionContent(d)
        return (
          d.title.toLowerCase().includes(searchLower) ||
          parsed.question?.toLowerCase().includes(searchLower) ||
          parsed.reasoning?.toLowerCase().includes(searchLower) ||
          parsed.choice_made?.toLowerCase().includes(searchLower) ||
          d.tags.some(t => t.toLowerCase().includes(searchLower))
        )
      })
    }
    
    // Apply tag filter
    if (tag) {
      decisions = decisions.filter(d => d.tags.includes(tag))
    }
    
    // Parse and enrich decisions
    const enrichedDecisions = await Promise.all(
      decisions.map(async (item) => {
        const parsed = parseDecisionContent(item)
        const connections = await getConnectionsForItem(item.id)
        
        // Apply outcome filter
        if (withOutcome === 'complete' && !parsed.outcome) return null
        if (withOutcome === 'pending' && parsed.outcome) return null
        
        // Apply superseded filter
        if (superseded === 'false' && parsed.superseded_by) return null
        if (superseded === 'true' && !parsed.superseded_by) return null
        
        return {
          id: item.id,
          title: item.title,
          ...parsed,
          tags: item.tags,
          status: item.status,
          created_at: item.created_at,
          updated_at: item.updated_at,
          related_items: connections.map(c => 
            c.source_id === item.id ? c.target_id : c.source_id
          ),
        }
      })
    )
    
    // Filter out nulls from filters
    const finalDecisions = enrichedDecisions.filter(Boolean)
    
    // Sort by decision date descending
    finalDecisions.sort((a: any, b: any) => 
      new Date(b.decision_date).getTime() - new Date(a.decision_date).getTime()
    )
    
    return NextResponse.json({ decisions: finalDecisions })
  } catch (error) {
    console.error('Error fetching decisions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch decisions' },
      { status: 500 }
    )
  }
}

// POST /api/decisions - Create decision trace
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      title,
      question,
      options_considered = [],
      choice_made,
      reasoning,
      decision_date = new Date().toISOString(),
      tags = [],
      related_item_ids = [], // IDs to connect this decision to
      status = 'reference'
    } = body
    
    if (!title || !question || !choice_made || !reasoning) {
      return NextResponse.json(
        { error: 'Missing required: title, question, choice_made, reasoning' },
        { status: 400 }
      )
    }
    
    // Build content object with all decision fields
    const content = JSON.stringify({
      question,
      options_considered,
      choice_made,
      reasoning,
      decision_date,
      outcome: null,
      outcome_date: null,
      superseded_by: null
    })
    
    const fullTitle = title.startsWith('Decision: ') ? title : `Decision: ${title}`
    
    // Insert as item
    const item = await createItem({
      title: fullTitle,
      content,
      category: 'decisions',
      tags: [...tags, 'decision-trace'],
      status,
      summary: `Chose: ${choice_made.substring(0, 100)}${choice_made.length > 100 ? '...' : ''}`,
      reviewed_at: new Date().toISOString(),
      agent_confidence: 1,
      disposition: 'reference',
      duplicate_of: null,
      cluster_key: 'decision-trace',
      promotion_target: null,
      needs_review: false,
      attention_reason: null,
    })
    
    // Create connections to related items
    for (const relatedId of related_item_ids) {
      await createConnection({
        source_id: item.id,
        target_id: relatedId,
        relationship_type: 'decision-based-on'
      })
    }
    
    return NextResponse.json({ 
      decision: {
        id: item.id,
        title: fullTitle,
        question,
        options_considered,
        choice_made,
        reasoning,
        decision_date,
        tags: [...tags, 'decision-trace'],
        related_items: related_item_ids
      }
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating decision:', error)
    return NextResponse.json(
      { error: 'Failed to create decision trace' },
      { status: 500 }
    )
  }
}

// PUT /api/decisions - Update decision (add outcome or mark superseded)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, outcome, outcome_date, superseded_by, ...otherUpdates } = body
    
    if (!id) {
      return NextResponse.json(
        { error: 'Missing required: id' },
        { status: 400 }
      )
    }
    
    // Get current item
    const item = await getItemById(id)
    if (!item || item.category !== 'decisions') {
      return NextResponse.json({ error: 'Decision not found' }, { status: 404 })
    }
    
    // Parse current content
    const content = JSON.parse(item.content)
    
    // Update fields
    if (outcome !== undefined) content.outcome = outcome
    if (outcome_date !== undefined) content.outcome_date = outcome_date || new Date().toISOString()
    if (superseded_by !== undefined) content.superseded_by = superseded_by
    
    // Update item
    await updateItem(id, { content: JSON.stringify(content) })
    
    return NextResponse.json({ 
      decision: { id, ...content }
    })
  } catch (error) {
    console.error('Error updating decision:', error)
    return NextResponse.json(
      { error: 'Failed to update decision' },
      { status: 500 }
    )
  }
}
