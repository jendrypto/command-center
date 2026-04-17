import { Item } from './db'

export async function summarizeContent(content: string): Promise<string> {
  const sentences = content.split(/[.!?]+/).filter((sentence) => sentence.trim().length > 0)

  if (sentences.length <= 2) {
    return content.trim()
  }

  const keyIndicators = ['key', 'important', 'main', 'primary', 'essential', 'critical', 'core']
  const keyPoints = sentences.filter((sentence) =>
    keyIndicators.some((indicator) => sentence.toLowerCase().includes(indicator))
  )

  const summary = [sentences[0], ...keyPoints].slice(0, 3).join('. ')
  return summary.length > 200 ? `${summary.slice(0, 200)}...` : summary
}

export function autoTagContent(title: string, content: string): string[] {
  const tags: string[] = []
  const text = `${title} ${content}`.toLowerCase()

  const patterns: Record<string, RegExp[]> = {
    trading: [/\b(trade|trading|stock|market|crypto|bitcoin|forex|chart|price|bull|bear|pump|dump)\b/],
    business: [/\b(business|startup|revenue|profit|company|investor|funding|sales|marketing|customer)\b/],
    music: [/\b(music|song|album|artist|band|production|audio|mix|master|recording|midi|synthesizer)\b/],
    tech: [/\b(tech|technology|software|code|programming|api|app|database|server|cloud|ai|ml|llm)\b/],
    design: [/\b(design|ui|ux|interface|prototype|figma|sketch|visual|brand|logo)\b/],
    writing: [/\b(writing|blog|article|content|copy|essay|story|book|publish)\b/],
    health: [/\b(health|fitness|workout|gym|exercise|diet|nutrition|mental|meditation)\b/],
    productivity: [/\b(productivity|habit|routine|workflow|automation|efficiency|focus|time)\b/],
  }

  for (const [tag, regexes] of Object.entries(patterns)) {
    if (regexes.some((regex) => regex.test(text))) {
      tags.push(tag)
    }
  }

  return tags
}

export function extractKeyPoints(content: string): string[] {
  const sentences = content.split(/[.!?]+/).filter((sentence) => sentence.trim().length > 20)
  const keyPoints: string[] = []

  const bulletPattern = /^[\s]*[-•\*\d][\s]+(.+)$/gm
  const bullets = content.match(bulletPattern)
  if (bullets) {
    keyPoints.push(...bullets.map((bullet) => bullet.replace(/^[\s]*[-•\*\d][\s]+/, '').trim()))
  }

  const indicators = ['key point', 'important', 'remember', 'note that', 'essentially', 'basically', 'the main']
  sentences.forEach((sentence) => {
    if (indicators.some((indicator) => sentence.toLowerCase().includes(indicator))) {
      keyPoints.push(sentence.trim())
    }
  })

  if (keyPoints.length === 0 && sentences.length > 0) {
    keyPoints.push(...sentences.slice(0, 3))
  }

  return Array.from(new Set(keyPoints)).slice(0, 5)
}

export function findPotentialConnections(items: Item[], targetItem: Item): Array<{ item: Item; reason: string }> {
  const suggestions: Array<{ item: Item; reason: string }> = []
  const targetText = `${targetItem.title} ${targetItem.content}`.toLowerCase()

  for (const item of items) {
    if (item.id === targetItem.id) continue

    const itemText = `${item.title} ${item.content}`.toLowerCase()
    const targetWords = targetText.split(/\s+/).filter((word) => word.length > 4)
    const itemWords = itemText.split(/\s+/).filter((word) => word.length > 4)

    const commonWords = targetWords.filter((word) => itemWords.includes(word))
    const commonTags = targetItem.tags.filter((tag) => item.tags.includes(tag))
    const sameCategory = targetItem.category === item.category
    const clusterMatch = targetItem.cluster_key && item.cluster_key && targetItem.cluster_key === item.cluster_key

    if (clusterMatch || commonWords.length >= 3 || commonTags.length > 0 || (sameCategory && commonWords.length >= 2)) {
      let reason = ''
      if (clusterMatch) {
        reason = `Shared cluster: ${targetItem.cluster_key}`
      } else if (commonTags.length > 0) {
        reason = `Shared tags: ${commonTags.join(', ')}`
      } else if (commonWords.length >= 3) {
        reason = `Related concepts: ${commonWords.slice(0, 3).join(', ')}`
      } else if (sameCategory) {
        reason = `Both are ${targetItem.category}`
      }

      suggestions.push({ item, reason })
    }
  }

  return suggestions
    .sort((a, b) => {
      const score = (reason: string) =>
        reason.startsWith('Shared cluster') ? 4 : reason.startsWith('Shared tags') ? 3 : reason.startsWith('Related concepts') ? 2 : 1
      return score(b.reason) - score(a.reason)
    })
    .slice(0, 5)
}

export function isStale(item: Item): boolean {
  if (item.status === 'archived' || item.status === 'promoted') return false
  const comparison = new Date(item.reviewed_at || item.updated_at || item.created_at)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  return comparison < sevenDaysAgo
}

export function getAgeIndicator(item: Item): { label: string; color: string } {
  const anchor = new Date(item.reviewed_at || item.updated_at || item.created_at)
  const now = new Date()
  const daysDiff = Math.floor((now.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24))

  if (daysDiff < 1) {
    return { label: item.reviewed_at ? 'Reviewed today' : 'Today', color: 'text-green-400' }
  }
  if (daysDiff < 2) {
    return { label: item.reviewed_at ? 'Reviewed yesterday' : 'Yesterday', color: 'text-green-400' }
  }
  if (daysDiff < 7) {
    return { label: `${daysDiff} days`, color: 'text-blue-400' }
  }
  if (daysDiff < 14) {
    return { label: '1 week', color: 'text-yellow-400' }
  }
  return { label: `${Math.floor(daysDiff / 7)} weeks`, color: 'text-red-400' }
}

export interface DailyDigest {
  newItems: Item[]
  staleItems: Item[]
  rawCount: number
  candidateCount: number
  needsReviewCount: number
  promotedCount: number
  connectionSuggestions: Array<{ item: Item; suggestions: Array<{ item: Item; reason: string }> }>
  exceptionItems: Item[]
}

export function generateDailyDigest(items: Item[]): DailyDigest {
  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const newItems = items.filter((item) => new Date(item.created_at) > oneDayAgo)
  const staleItems = items.filter((item) => isStale(item))
  const rawCount = items.filter((item) => item.status === 'raw').length
  const candidateCount = items.filter((item) => item.status === 'candidate').length
  const needsReviewCount = items.filter((item) => item.needs_review).length
  const promotedCount = items.filter((item) => item.status === 'promoted').length
  const exceptionItems = items.filter((item) => item.needs_review || item.status === 'candidate').slice(0, 8)

  const connectionSuggestions = items
    .filter((item) => item.status === 'raw' || item.status === 'candidate')
    .slice(0, 4)
    .map((item) => ({
      item,
      suggestions: findPotentialConnections(items, item),
    }))
    .filter((candidate) => candidate.suggestions.length > 0)

  return {
    newItems,
    staleItems,
    rawCount,
    candidateCount,
    needsReviewCount,
    promotedCount,
    connectionSuggestions,
    exceptionItems,
  }
}
