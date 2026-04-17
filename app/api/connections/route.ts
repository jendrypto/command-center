import { NextRequest, NextResponse } from 'next/server'
import {
  createConnection,
  getAllConnections,
  getConnectionsForItem,
  deleteConnection,
  deleteConnectionBetween,
  Connection,
} from '@/lib/db'

// GET /api/connections - List connections
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const itemId = searchParams.get('itemId')
    
    let connections: Connection[]
    
    if (itemId) {
      connections = await getConnectionsForItem(parseInt(itemId))
    } else {
      connections = await getAllConnections()
    }
    
    return NextResponse.json({ connections })
  } catch (error) {
    console.error('Error fetching connections:', error)
    return NextResponse.json(
      { error: 'Failed to fetch connections' },
      { status: 500 }
    )
  }
}

// POST /api/connections - Create new connection
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { source_id, target_id, relationship_type = 'related' } = body
    
    if (!source_id || !target_id) {
      return NextResponse.json(
        { error: 'Missing required fields: source_id, target_id' },
        { status: 400 }
      )
    }
    
    if (source_id === target_id) {
      return NextResponse.json(
        { error: 'Cannot connect an item to itself' },
        { status: 400 }
      )
    }
    
    const connection = await createConnection({
      source_id,
      target_id,
      relationship_type,
    })
    
    return NextResponse.json({ connection }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating connection:', error)
    
    // Handle unique constraint violation
    if (error.message?.includes('UNIQUE constraint failed')) {
      return NextResponse.json(
        { error: 'Connection already exists' },
        { status: 409 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to create connection' },
      { status: 500 }
    )
  }
}

// DELETE /api/connections?id=X or DELETE /api/connections?source=X&target=Y
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const sourceId = searchParams.get('source')
    const targetId = searchParams.get('target')
    
    if (id) {
      const success = await deleteConnection(parseInt(id))
      
      if (!success) {
        return NextResponse.json(
          { error: 'Connection not found' },
          { status: 404 }
        )
      }
      
      return NextResponse.json({ success: true })
    }
    
    if (sourceId && targetId) {
      const success = await deleteConnectionBetween(parseInt(sourceId), parseInt(targetId))
      
      if (!success) {
        return NextResponse.json(
          { error: 'Connection not found' },
          { status: 404 }
        )
      }
      
      return NextResponse.json({ success: true })
    }
    
    return NextResponse.json(
      { error: 'Missing required parameters: id OR source+target' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error deleting connection:', error)
    return NextResponse.json(
      { error: 'Failed to delete connection' },
      { status: 500 }
    )
  }
}
