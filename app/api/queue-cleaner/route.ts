import { NextRequest, NextResponse } from 'next/server'
import { applyCleanupAction, archiveDuplicateGroup, buildQueueCleanerReport, demoteHeartbeatGroup } from '@/lib/queue-cleaner'

export async function GET() {
  try {
    const report = await buildQueueCleanerReport()
    return NextResponse.json(report)
  } catch (error) {
    console.error('Error building queue cleaner report:', error)
    return NextResponse.json({ error: 'Failed to build queue cleaner report' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const action = body.action as string | undefined

    if (action === 'archive-duplicate-group') {
      const itemIds = Array.isArray(body.itemIds) ? body.itemIds.map(Number).filter(Boolean) : []
      const primaryId = Number(body.primaryId)
      if (!itemIds.length || !primaryId) {
        return NextResponse.json({ error: 'itemIds and primaryId are required' }, { status: 400 })
      }
      const result = await archiveDuplicateGroup(itemIds, primaryId)
      const report = await buildQueueCleanerReport()
      return NextResponse.json({ success: true, result, report })
    }

    if (action === 'demote-heartbeat-group') {
      const itemIds = Array.isArray(body.itemIds) ? body.itemIds.map(Number).filter(Boolean) : []
      if (!itemIds.length) {
        return NextResponse.json({ error: 'itemIds is required' }, { status: 400 })
      }
      const result = await demoteHeartbeatGroup(itemIds)
      const report = await buildQueueCleanerReport()
      return NextResponse.json({ success: true, result, report })
    }

    const batchActions = ['archive', 'delete', 'reference']
    if (batchActions.includes(action || '')) {
      const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : []
      if (!ids.length) {
        return NextResponse.json({ error: 'ids (number[]) is required' }, { status: 400 })
      }
      const results = await applyCleanupAction(action as 'archive' | 'delete' | 'reference', ids)
      const succeeded = results.filter((r) => r.success).length
      const report = await buildQueueCleanerReport()
      return NextResponse.json({
        success: true,
        action,
        summary: { total: ids.length, succeeded, failed: ids.length - succeeded },
        results,
        report,
      })
    }

    return NextResponse.json({ error: 'Unsupported action. Use: archive-duplicate-group, demote-heartbeat-group, archive, delete, reference' }, { status: 400 })
  } catch (error) {
    console.error('Error applying queue cleaner action:', error)
    return NextResponse.json({ error: 'Failed to apply queue cleaner action' }, { status: 500 })
  }
}
