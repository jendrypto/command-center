import { createConnection, deleteItem, getAllItems, getStaleItems, getLowConnectionBacklog, Item, updateItem } from '@/lib/db'

export interface CleanerDuplicateGroup {
  key: string
  normalizedTitle: string
  similarity: number
  itemIds: number[]
  items: Item[]
  suggestedPrimaryId: number
  reason: string
}

export interface CleanerStaleGroup {
  title: string
  itemIds: number[]
  items: Item[]
  reason: string
}

export interface CleanerHeartbeatGroup {
  title: string
  itemIds: number[]
  items: Item[]
  reason: string
}

export interface QueueCleanerReport {
  generatedAt: string
  summary: {
    totalItems: number
    attentionItems: number
    duplicateGroups: number
    staleRepeatGroups: number
    noisyHeartbeatGroups: number
    staleItems: number
    orphanedItems: number
  }
  duplicateGroups: CleanerDuplicateGroup[]
  staleRepeatGroups: CleanerStaleGroup[]
  noisyHeartbeatGroups: CleanerHeartbeatGroup[]
  staleItems: Item[]
  orphanedItems: (Item & { connection_count: number })[]
}

export interface QueueCleanerApplyResult {
  archivedIds: number[]
  linkedPairs: Array<{ sourceId: number; targetId: number }>
  updatedIds: number[]
}

function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    // Strip times like "3:45 pm" so captures taken at different times of day cluster.
    .replace(/\b\d{1,2}:\d{2}\s?(am|pm)\b/g, ' ')
    // Strip ISO dates so daily captures of the same thing cluster.
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    // Strip "Month D, YYYY" so captures written in prose dates cluster.
    .replace(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(st|nd|rd|th)?,?\s*\d{4}?\b/g,
      ' '
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toTokenSet(text: string) {
  return new Set(
    normalizeTitle(text)
      .split(' ')
      .filter((token) => token.length > 2)
  )
}

function jaccard(a: Set<string>, b: Set<string>) {
  if (a.size === 0 && b.size === 0) return 1
  const intersection = [...a].filter((token) => b.has(token)).length
  const union = new Set([...a, ...b]).size
  return union === 0 ? 0 : intersection / union
}

function isOpenItem(item: Item) {
  return item.status !== 'archived' && item.status !== 'promoted'
}

function pickPrimary(items: Item[]) {
  return [...items].sort((a, b) => {
    const reviewDelta = Number(a.needs_review) - Number(b.needs_review)
    if (reviewDelta !== 0) return reviewDelta
    const statusWeight = (item: Item) => {
      switch (item.status) {
        case 'candidate': return 0
        case 'clustered': return 1
        case 'reference': return 2
        case 'raw': return 3
        default: return 4
      }
    }
    const statusDelta = statusWeight(a) - statusWeight(b)
    if (statusDelta !== 0) return statusDelta
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })[0]
}

export async function buildQueueCleanerReport(): Promise<QueueCleanerReport> {
  const [items, staleItems, orphanedItems] = await Promise.all([
    getAllItems(),
    getStaleItems(),
    getLowConnectionBacklog(20),
  ])
  const openItems = items.filter(isOpenItem)
  const attentionItems = openItems.filter((item) => item.needs_review || item.status === 'raw' || item.status === 'candidate')

  const duplicateGroups: CleanerDuplicateGroup[] = []
  const seenPairs = new Set<string>()

  // Pre-compute normalized titles and token sets once per item.
  // Previously these were recomputed inside the O(n²) comparison plus inside
  // the grouping filter — effectively O(n³) calls to normalizeTitle on large
  // workspaces. One pass keeps the comparison work true O(n²) with cheap
  // string equality and set intersections.
  const normalized: string[] = openItems.map((item) => normalizeTitle(item.title))
  const tokenSets: Set<string>[] = openItems.map((item) => toTokenSet(item.title))

  for (let i = 0; i < openItems.length; i++) {
    for (let j = i + 1; j < openItems.length; j++) {
      const sameExactTitle = normalized[i] === normalized[j]
      const pairSimilarity = sameExactTitle ? 1 : jaccard(tokenSets[i], tokenSets[j])
      const similar = pairSimilarity >= 0.8
      if (!sameExactTitle && !similar) continue

      const a = openItems[i]
      const b = openItems[j]

      const key = [a.id, b.id].sort((x, y) => x - y).join(':')
      if (seenPairs.has(key)) continue
      seenPairs.add(key)

      const groupedIndexes: number[] = []
      for (let k = 0; k < openItems.length; k++) {
        if (normalized[k] === normalized[i] || jaccard(tokenSets[k], tokenSets[i]) >= 0.8) {
          groupedIndexes.push(k)
        }
      }

      if (groupedIndexes.length < 2) continue

      const uniqueIds = [...new Set(groupedIndexes.map((k) => openItems[k].id))]
      const fullGroup = groupedIndexes.map((k) => openItems[k])

      const groupKey = uniqueIds.slice().sort((x, y) => x - y).join('-')
      if (duplicateGroups.some((group) => group.key === groupKey)) continue

      const primary = pickPrimary(fullGroup)
      duplicateGroups.push({
        key: groupKey,
        normalizedTitle: normalized[i],
        similarity: pairSimilarity,
        itemIds: uniqueIds,
        items: fullGroup.sort((x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime()),
        suggestedPrimaryId: primary.id,
        reason: sameExactTitle
          ? 'Exact title match across open items.'
          : 'Highly similar titles likely represent the same idea or stale task.',
      })
    }
  }

  const staleRepeatGroups = duplicateGroups
    .filter((group) => {
      const oldest = Math.min(...group.items.map((item) => new Date(item.created_at).getTime()))
      const ageDays = (Date.now() - oldest) / (1000 * 60 * 60 * 24)
      return ageDays >= 1 && group.items.some((item) => item.title.toLowerCase().startsWith('stale task:'))
    })
    .map((group) => ({
      title: group.items[0].title,
      itemIds: group.itemIds,
      items: group.items,
      reason: 'Repeated stale-task capture. This should be deduped and fixed at the source.',
    }))

  const noisyHeartbeatGroups = duplicateGroups
    .filter((group) => group.items.every((item) => item.title.toLowerCase().startsWith('heartbeat ')))
    .map((group) => ({
      title: group.items[0].title,
      itemIds: group.itemIds,
      items: group.items,
      reason: 'Heartbeat capture looks repetitive and should usually be summarized, referenced, or archived.',
    }))

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalItems: items.length,
      attentionItems: attentionItems.length,
      duplicateGroups: duplicateGroups.length,
      staleRepeatGroups: staleRepeatGroups.length,
      noisyHeartbeatGroups: noisyHeartbeatGroups.length,
      staleItems: staleItems.length,
      orphanedItems: orphanedItems.length,
    },
    duplicateGroups,
    staleRepeatGroups,
    noisyHeartbeatGroups,
    staleItems,
    orphanedItems,
  }
}

export async function applyCleanupAction(
  action: 'archive' | 'delete' | 'reference',
  ids: number[]
): Promise<Array<{ id: number; success: boolean; error: string | null }>> {
  return Promise.all(
    ids.map(async (id) => {
      try {
        if (action === 'delete') {
          const success = await deleteItem(id)
          return { id, success, error: success ? null : 'Item not found' }
        }
        const status = action === 'archive' ? 'archived' : 'reference'
        const disposition = action === 'archive' ? 'archive' : 'reference'
        const item = await updateItem(id, {
          status: status as any,
          disposition: disposition as any,
          needs_review: false,
          attention_reason: null,
          reviewed_at: new Date().toISOString(),
        })
        return { id, success: !!item, error: item ? null : 'Item not found' }
      } catch (error) {
        return { id, success: false, error: error instanceof Error ? error.message : 'Unknown error' }
      }
    })
  )
}

export async function archiveDuplicateGroup(itemIds: number[], primaryId: number): Promise<QueueCleanerApplyResult> {
  const archivedIds: number[] = []
  const linkedPairs: Array<{ sourceId: number; targetId: number }> = []
  const updatedIds: number[] = []

  for (const itemId of itemIds) {
    if (itemId === primaryId) {
      await updateItem(itemId, {
        status: 'candidate',
        disposition: 'keep_incubating',
        needs_review: false,
        attention_reason: null,
        reviewed_at: new Date().toISOString(),
      })
      updatedIds.push(itemId)
      continue
    }

    await updateItem(itemId, {
      status: 'archived',
      disposition: 'merge_duplicate',
      duplicate_of: primaryId,
      needs_review: false,
      attention_reason: 'Archived by queue cleaner as duplicate',
      reviewed_at: new Date().toISOString(),
    })
    archivedIds.push(itemId)

    try {
      await createConnection({ source_id: itemId, target_id: primaryId, relationship_type: 'duplicate' })
      linkedPairs.push({ sourceId: itemId, targetId: primaryId })
    } catch {
      // Ignore existing duplicate links.
    }
  }

  return { archivedIds, linkedPairs, updatedIds }
}

export async function demoteHeartbeatGroup(itemIds: number[]): Promise<QueueCleanerApplyResult> {
  const archivedIds: number[] = []
  const linkedPairs: Array<{ sourceId: number; targetId: number }> = []
  const updatedIds: number[] = []

  for (const itemId of itemIds) {
    await updateItem(itemId, {
      status: 'reference',
      disposition: 'reference',
      needs_review: false,
      attention_reason: null,
      reviewed_at: new Date().toISOString(),
    })
    updatedIds.push(itemId)
  }

  return { archivedIds, linkedPairs, updatedIds }
}
