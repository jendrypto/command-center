'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  Clock3,
  Eye,
  Filter,
  GitGraph,
  LayoutGrid,
  Menu,
  Plus,
  Rocket,
  Search,
  Sparkles,
  Target,
  Trash2,
  X,
} from 'lucide-react'
import Link from 'next/link'
import config from '@/command-space.config'
import { Item } from '@/lib/db'
import { getAgeIndicator } from '@/lib/ai'
import { useNotifications } from '@/lib/useNotifications'
import CardView from '@/components/CardView'
import CaptureModal from '@/components/CaptureModal'
import DetailPanel from '@/components/DetailPanel'
import QueueCleaner from '@/components/QueueCleaner'

type QueueFilter = 'attention' | 'daily-digest' | 'all' | 'raw' | 'candidate' | 'clustered' | 'reference' | 'promoted' | 'archived'
type CategoryFilter = 'all' | 'ideas' | 'conversations' | 'research' | 'bookmarks' | 'decisions'
type FocusFilter = 'all' | string

const AGENT_NAME = config.agent.name
const DASHBOARD_TITLE = config.dashboard.title

const queueLabels: Record<QueueFilter, string> = {
  attention: 'Operator Dashboard',
  'daily-digest': 'Daily Digests',
  all: 'All Workspace Items',
  raw: 'Raw Capture',
  candidate: 'Action Candidates',
  clustered: 'Clustered Themes',
  reference: 'Reference Shelf',
  promoted: 'Promoted',
  archived: 'Archived',
}

const queueDescriptions: Record<QueueFilter, string> = {
  attention: 'What matters now, what slipped, and what to push next.',
  'daily-digest': 'Automated end-of-day summaries — what was built, changed, and decided.',
  all: 'Complete workspace view across every state.',
  raw: 'Unprocessed captures waiting for classification.',
  candidate: 'Items likely to become action or need human review.',
  clustered: 'Related context grouped into themes.',
  reference: 'Useful material kept alive without action pressure.',
  promoted: 'Items already pushed to the configured promotion target.',
  archived: 'Resolved, duplicated, or dead context.',
}

const categoryLabels: Record<CategoryFilter, string> = {
  all: 'All Categories',
  ideas: 'Ideas',
  conversations: 'Conversations',
  research: 'Research',
  bookmarks: 'Bookmarks',
  decisions: 'Decisions',
}

const categoryDots = {
  ideas: 'bg-category-ideas',
  conversations: 'bg-category-conversations',
  research: 'bg-category-research',
  bookmarks: 'bg-category-bookmarks',
  decisions: 'bg-red-500',
}

function isWithinHours(value?: string | null, hours = 24) {
  if (!value) return false
  const time = new Date(value).getTime()
  return Number.isFinite(time) && Date.now() - time <= hours * 60 * 60 * 1000
}

function summarizeItem(item: Item) {
  const raw = item.attention_reason || item.summary || item.content || ''
  return raw.length > 140 ? `${raw.slice(0, 140)}…` : raw
}

function pickPriorityItems(items: Item[]) {
  return [...items]
    .filter((item) => item.status !== 'archived')
    .sort((a, b) => {
      const aScore = (a.needs_review ? 100 : 0) + a.focus_score + (a.status === 'candidate' ? 18 : a.status === 'raw' ? 12 : 0)
      const bScore = (b.needs_review ? 100 : 0) + b.focus_score + (b.status === 'candidate' ? 18 : b.status === 'raw' ? 12 : 0)
      return bScore - aScore
    })
}

export default function CommandCenter() {
  const [items, setItems] = useState<Item[]>([])
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [isCaptureOpen, setIsCaptureOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('attention')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [focusFilter, setFocusFilter] = useState<FocusFilter>('all')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [isCleanerOpen, setIsCleanerOpen] = useState(false)

  const focusAreas = config.focusAreas
  const focusOrder = useMemo<string[]>(() => focusAreas.map((area) => area.id), [focusAreas])
  const focusLabels = useMemo<Record<string, string>>(
    () => ({ all: 'All Lanes', ...Object.fromEntries(focusAreas.map((area) => [area.id, area.label])) }),
    [focusAreas]
  )
  const focusColors = useMemo<Record<string, string>>(
    () => Object.fromEntries(focusAreas.map((area) => [area.id, area.color])),
    [focusAreas]
  )

  const fetchItems = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/items')
      const data = await response.json()
      setItems(data.items || [])
    } catch (error) {
      console.error('Error fetching items:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useNotifications(fetchItems)

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const attentionItems = useMemo(
    () => items.filter((item) => item.needs_review || item.status === 'candidate' || item.status === 'raw'),
    [items]
  )

  const recentPromoted = useMemo(
    () => items.filter((item) => item.status === 'promoted').slice(0, 4),
    [items]
  )

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (searchQuery) {
          const query = searchQuery.toLowerCase()
          const matchesSearch =
            item.title.toLowerCase().includes(query) ||
            item.content.toLowerCase().includes(query) ||
            item.tags.some((tag) => tag.toLowerCase().includes(query)) ||
            (item.attention_reason || '').toLowerCase().includes(query) ||
            (item.cluster_key || '').toLowerCase().includes(query)
          if (!matchesSearch) return false
        }

        if (queueFilter === 'attention') {
          if (!(item.needs_review || item.status === 'candidate' || item.status === 'raw')) {
            return false
          }
        } else if (queueFilter === 'daily-digest') {
          if (!item.tags.some((tag) => tag === 'daily-digest')) {
            return false
          }
        } else if (queueFilter !== 'all' && item.status !== queueFilter) {
          return false
        }

        if (categoryFilter !== 'all' && item.category !== categoryFilter) {
          return false
        }

        if (focusFilter !== 'all' && item.focus_area !== focusFilter) {
          return false
        }

        return true
      }),
    [items, searchQuery, queueFilter, categoryFilter, focusFilter]
  )

  const activeItems = useMemo(() => items.filter((item) => item.status !== 'archived'), [items])
  const createdToday = useMemo(() => items.filter((item) => isWithinHours(item.created_at, 24)), [items])
  const updatedToday = useMemo(() => items.filter((item) => isWithinHours(item.updated_at, 24)), [items])
  const staleItems = useMemo(
    () => activeItems.filter((item) => !isWithinHours(item.updated_at, 72)).sort((a, b) => a.focus_score - b.focus_score),
    [activeItems]
  )
  const priorityStack = useMemo(() => pickPriorityItems(attentionItems), [attentionItems])
  const todayPriorities = useMemo(() => priorityStack.slice(0, 3), [priorityStack])
  const thisWeekPriorities = useMemo(() => pickPriorityItems(activeItems).slice(0, 6), [activeItems])
  const blockers = useMemo(
    () =>
      activeItems
        .filter((item) =>
          /waiting|blocked|stale|needs review|approval|pending|stuck|escalat/i.test(
            `${item.title} ${item.content} ${item.attention_reason || ''}`
          )
        )
        .slice(0, 6),
    [activeItems]
  )
  const pendingDecisions = useMemo(
    () =>
      activeItems
        .filter(
          (item) =>
            item.needs_review ||
            /decide|decision|should we|pricing|direction|which|choose|pick/i.test(`${item.title} ${item.content}`)
        )
        .slice(0, 6),
    [activeItems]
  )
  const waitingOn = useMemo(
    () =>
      activeItems
        .filter((item) =>
          /waiting on|follow up|follow-up|reply|awaiting|pending response|confirm/i.test(
            `${item.title} ${item.content}`
          )
        )
        .slice(0, 6),
    [activeItems]
  )
  const opportunities = useMemo(
    () =>
      activeItems
        .filter((item) => item.category === 'ideas' && ['candidate', 'clustered', 'raw'].includes(item.status))
        .sort((a, b) => b.focus_score - a.focus_score)
        .slice(0, 6),
    [activeItems]
  )
  const recentMovement = useMemo(
    () => [...updatedToday].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 8),
    [updatedToday]
  )

  const laneData = useMemo(
    () =>
      focusOrder.map((lane) => {
        const laneItems = activeItems.filter((item) => item.focus_area === lane)
        const nextAction = pickPriorityItems(
          laneItems.filter((item) => item.needs_review || item.status === 'candidate' || item.status === 'raw')
        )[0]
        const staleCount = laneItems.filter((item) => !isWithinHours(item.updated_at, 72)).length
        const urgentCount = laneItems.filter((item) => item.needs_review || item.status === 'candidate').length
        return {
          lane,
          items: laneItems,
          nextAction,
          staleCount,
          urgentCount,
          summary:
            staleCount > 0
              ? `${staleCount} stale, ${urgentCount} urgent`
              : urgentCount > 0
                ? `${urgentCount} urgent items`
                : laneItems.length > 0
                  ? 'moving'
                  : 'quiet',
        }
      }),
    [activeItems, focusOrder]
  )

  const defaultLaneCount = useMemo(() => {
    if (focusOrder.length === 0) return 0
    const lastLane = focusOrder[focusOrder.length - 1]
    return activeItems.filter((item) => item.focus_area === lastLane).length
  }, [activeItems, focusOrder])

  const handleItemClick = (item: Item) => {
    setSelectedItem(item)
    setIsDetailOpen(true)
  }

  const handleCreateItem = async (itemData: {
    title: string
    content: string
    category: Item['category']
    tags: string[]
    autoAnalyze: boolean
  }) => {
    try {
      const response = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData),
      })

      if (response.ok) {
        await fetchItems()
        setIsCaptureOpen(false)
        setQueueFilter('attention')
      }
    } catch (error) {
      console.error('Error creating item:', error)
    }
  }

  const handleUpdateItem = async (id: number, updates: Partial<Item>) => {
    try {
      const response = await fetch('/api/items', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })

      if (response.ok) {
        await fetchItems()
        if (selectedItem?.id === id) {
          const updatedItem = items.find((candidate) => candidate.id === id)
          if (updatedItem) {
            setSelectedItem({ ...updatedItem, ...updates })
          }
        }
      }
    } catch (error) {
      console.error('Error updating item:', error)
    }
  }

  const handleDeleteItem = async (id: number) => {
    try {
      const response = await fetch(`/api/items?id=${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        await fetchItems()
        setIsDetailOpen(false)
        setSelectedItem(null)
      }
    } catch (error) {
      console.error('Error deleting item:', error)
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-dark-900">
      <aside
        className={`${isSidebarOpen ? 'w-80' : 'w-0'} flex-shrink-0 overflow-hidden border-r border-dark-600 bg-dark-800 transition-all duration-300`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-dark-600 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400">
                <Brain className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">{DASHBOARD_TITLE}</h1>
                <p className="text-xs text-gray-400">Operator cockpit for {AGENT_NAME}</p>
              </div>
            </div>
          </div>

          <div className="p-4">
            <button
              onClick={() => setIsCaptureOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-3 font-medium text-white transition-all hover:from-blue-500 hover:to-cyan-400"
            >
              <Plus className="h-5 w-5" />
              Capture for {AGENT_NAME}
            </button>
          </div>

          <div className="px-4 pb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search titles, notes, tags, clusters..."
                className="w-full rounded-xl border border-dark-600 bg-dark-700 py-2.5 pl-10 pr-4 text-sm text-white outline-none transition-colors focus:border-blue-500"
              />
            </div>
          </div>

          <div className="px-4">
            <div className="rounded-xl border border-dark-600 bg-dark-700/60 p-3">
              <div className="mb-3 flex items-center gap-2 text-sm text-gray-300">
                <Target className="h-4 w-4 text-cyan-400" />
                <span>Operator View</span>
              </div>
              <div className="space-y-2">
                <QueueButton active={queueFilter === 'attention'} label="Dashboard" count={attentionItems.length} onClick={() => setQueueFilter('attention')} />
                <QueueButton active={queueFilter === 'daily-digest'} label="Daily Digests" count={items.filter((item) => item.tags.some((t) => t === 'daily-digest')).length} onClick={() => setQueueFilter('daily-digest')} />
                <QueueButton active={queueFilter === 'raw'} label="Raw Capture" count={items.filter((item) => item.status === 'raw').length} onClick={() => setQueueFilter('raw')} />
                <QueueButton active={queueFilter === 'candidate'} label="Candidates" count={items.filter((item) => item.status === 'candidate').length} onClick={() => setQueueFilter('candidate')} />
                <QueueButton active={queueFilter === 'clustered'} label="Clusters" count={items.filter((item) => item.status === 'clustered').length} onClick={() => setQueueFilter('clustered')} />
                <QueueButton active={queueFilter === 'reference'} label="Reference" count={items.filter((item) => item.status === 'reference').length} onClick={() => setQueueFilter('reference')} />
                <QueueButton active={queueFilter === 'all'} label="Full Workspace" count={items.length} onClick={() => setQueueFilter('all')} />
              </div>
            </div>
          </div>

          <div className="px-4 pt-4">
            <div className="mb-2 flex items-center gap-2 text-sm text-gray-400">
              <Filter className="h-4 w-4" />
              <span>Category Slice</span>
            </div>
            <div className="space-y-1">
              {(Object.keys(categoryLabels) as CategoryFilter[]).map((category) => (
                <button
                  key={category}
                  onClick={() => setCategoryFilter(category)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
                    categoryFilter === category ? 'bg-dark-600 text-white' : 'text-gray-400 hover:bg-dark-700 hover:text-white'
                  }`}
                >
                  <span className={`h-3 w-3 rounded-full ${category === 'all' ? 'bg-gray-500' : categoryDots[category as keyof typeof categoryDots]}`} />
                  <span className="flex-1 text-left">{categoryLabels[category]}</span>
                  <span className="text-xs text-gray-500">{category === 'all' ? items.length : items.filter((item) => item.category === category).length}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 pt-4">
            <div className="mb-2 flex items-center gap-2 text-sm text-gray-400">
              <Sparkles className="h-4 w-4" />
              <span>Strategic Lane</span>
            </div>
            <div className="space-y-1">
              <LaneButton
                active={focusFilter === 'all'}
                label="All Lanes"
                color="#6b7280"
                count={items.length}
                onClick={() => setFocusFilter('all')}
              />
              {focusAreas.map((area) => (
                <LaneButton
                  key={area.id}
                  active={focusFilter === area.id}
                  label={area.label}
                  color={area.color}
                  count={items.filter((item) => item.focus_area === area.id).length}
                  onClick={() => setFocusFilter(area.id)}
                />
              ))}
            </div>
          </div>

          <div className="mt-auto space-y-2 p-4">
            <button
              onClick={() => setIsCleanerOpen(true)}
              className="flex w-full items-center gap-2 rounded-xl border border-dark-600 bg-dark-700 px-3 py-3 text-sm text-gray-200 transition-all hover:bg-dark-600"
            >
              <Trash2 className="h-4 w-4 text-amber-400" />
              <span>Queue Cleaner</span>
              <ArrowRight className="ml-auto h-4 w-4 text-gray-500" />
            </button>
            <Link
              href="/daily"
              className="flex items-center gap-2 rounded-xl border border-dark-600 bg-dark-700 px-3 py-3 text-sm text-gray-200 transition-all hover:bg-dark-600"
            >
              <Clock3 className="h-4 w-4 text-emerald-400" />
              <span>Daily Memory</span>
              <ArrowRight className="ml-auto h-4 w-4 text-gray-500" />
            </Link>
            <Link
              href="/decisions"
              className="flex items-center gap-2 rounded-xl border border-dark-600 bg-dark-700 px-3 py-3 text-sm text-gray-200 transition-all hover:bg-dark-600"
            >
              <GitGraph className="h-4 w-4 text-cyan-400" />
              <span>Decision Trace</span>
              <ArrowRight className="ml-auto h-4 w-4 text-gray-500" />
            </Link>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-dark-600 bg-dark-800 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="rounded-lg p-2 transition-colors hover:bg-dark-700">
                {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <div>
                <h2 className="font-medium text-white">{queueLabels[queueFilter]}</h2>
                <p className="text-sm text-gray-400">
                  {queueDescriptions[queueFilter]}
                  {categoryFilter !== 'all' && ` Filtered to ${categoryLabels[categoryFilter].toLowerCase()}.`}
                  {focusFilter !== 'all' && ` Prioritizing ${focusLabels[focusFilter] ?? focusFilter}.`}
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-gray-400">Loading workspace...</div>
          ) : (
            <div className="space-y-4 p-4">
              <div className="grid gap-4 lg:grid-cols-5">
                <MetricCard icon={Target} label="Today Priorities" value={todayPriorities.length} tone="text-cyan-300" />
                <MetricCard icon={AlertTriangle} label="Blockers" value={blockers.length} tone="text-amber-300" />
                <MetricCard icon={Clock3} label="Stale Items" value={staleItems.length} tone="text-rose-300" />
                <MetricCard icon={Rocket} label="Active Builds" value={activeItems.filter((item) => /build|ship|launch|implement/i.test(`${item.title} ${item.content}`)).length} tone="text-emerald-300" />
                <MetricCard icon={Sparkles} label="24h Pulse" value={updatedToday.length} tone="text-blue-300" />
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <OperatorListCard
                  title="Today"
                  subtitle={`Top priorities ${AGENT_NAME} should push right now.`}
                  items={todayPriorities}
                  onItemClick={handleItemClick}
                  empty={`No urgent priorities in front of ${AGENT_NAME}.`}
                  focusColors={focusColors}
                />
                <OperatorListCard
                  title="This Week"
                  subtitle="Highest-signal stack across all lanes."
                  items={thisWeekPriorities}
                  onItemClick={handleItemClick}
                  empty="No weekly stack yet."
                  focusColors={focusColors}
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <section className="rounded-2xl border border-dark-600 bg-dark-800 p-4">
                  <div className="mb-3">
                    <h3 className="font-medium text-white">Project lanes</h3>
                    <p className="text-sm text-gray-400">Status, next action, and urgency by lane.</p>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {laneData.map((lane) => (
                      <button
                        key={lane.lane}
                        onClick={() => lane.nextAction && handleItemClick(lane.nextAction)}
                        className="rounded-xl border border-dark-600 bg-dark-700 p-4 text-left transition-all hover:border-dark-500 hover:bg-dark-600"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: focusColors[lane.lane] ?? '#6b7280' }}
                            />
                            <span className="font-medium text-white">{focusLabels[lane.lane] ?? lane.lane}</span>
                          </div>
                          <span
                            className="rounded border px-2 py-0.5 text-[10px]"
                            style={{
                              borderColor: focusColors[lane.lane] ?? '#6b7280',
                              color: focusColors[lane.lane] ?? '#9ca3af',
                            }}
                          >
                            {lane.summary}
                          </span>
                        </div>
                        <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
                          <MiniStat label="Live" value={lane.items.length} />
                          <MiniStat label="Urgent" value={lane.urgentCount} />
                          <MiniStat label="Stale" value={lane.staleCount} />
                        </div>
                        {lane.nextAction ? (
                          <div>
                            <div className="text-xs uppercase tracking-wide text-gray-500">Next action</div>
                            <div className="mt-1 text-sm font-medium text-white">{lane.nextAction.title}</div>
                            <p className="mt-1 line-clamp-2 text-xs text-gray-400">{summarizeItem(lane.nextAction)}</p>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500">No immediate action queued in this lane.</div>
                        )}
                      </button>
                    ))}
                  </div>
                </section>

                <div className="space-y-4">
                  <OperatorListCard
                    title="Blockers"
                    subtitle="Things slowing movement or waiting on a call."
                    items={blockers}
                    onItemClick={handleItemClick}
                    empty="No obvious blockers right now."
                    focusColors={focusColors}
                  />
                  <OperatorListCard
                    title="Stale"
                    subtitle="Items that haven’t moved in 72h+ and may be lying."
                    items={staleItems.slice(0, 6)}
                    onItemClick={handleItemClick}
                    empty="No stale items. Rare and beautiful."
                    focusColors={focusColors}
                  />
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <OperatorListCard
                  title="Opportunities"
                  subtitle="Best ideas in queue worth triage or productization."
                  items={opportunities}
                  onItemClick={handleItemClick}
                  empty="No opportunities surfaced yet."
                  focusColors={focusColors}
                />
                <OperatorListCard
                  title="Pending decisions"
                  subtitle="Calls that still need judgment, pricing, or direction."
                  items={pendingDecisions}
                  onItemClick={handleItemClick}
                  empty="No pending decisions in queue."
                  focusColors={focusColors}
                />
                <OperatorListCard
                  title="Waiting on follow-up"
                  subtitle="External dependencies, follow-ups, and pending responses."
                  items={waitingOn}
                  onItemClick={handleItemClick}
                  empty="No outstanding follow-ups tracked."
                  focusColors={focusColors}
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                <OperatorListCard
                  title="Pulse — last 24h"
                  subtitle={`New: ${createdToday.length} · touched: ${updatedToday.length}`}
                  items={recentMovement}
                  onItemClick={handleItemClick}
                  empty="No recent movement captured."
                  focusColors={focusColors}
                />
                <section className="rounded-2xl border border-dark-600 bg-dark-800 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Eye className="h-4 w-4 text-purple-400" />
                    <h3 className="font-medium text-white">Operational read</h3>
                  </div>
                  <ul className="space-y-2 text-sm text-gray-300">
                    <li>{attentionItems.length} items need active review or classification.</li>
                    <li>{defaultLaneCount} live items are outside the primary lanes.</li>
                    <li>{recentPromoted.length} items have been promoted downstream.</li>
                    <li>{createdToday.length} new items were created in the last 24 hours.</li>
                    <li>{pendingDecisions.length > blockers.length ? 'Decision debt is higher than execution debt.' : 'Execution debt is at least as high as decision debt.'}</li>
                  </ul>
                </section>
              </div>

              <section className="rounded-2xl border border-dark-600 bg-dark-800">
                <div className="border-b border-dark-600 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-white">Workspace state view</h3>
                      <p className="text-sm text-gray-400">{filteredItems.length} item{filteredItems.length === 1 ? '' : 's'} in the current slice.</p>
                    </div>
                  </div>
                </div>

                <div className="h-[540px]">
                  {filteredItems.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-gray-400">
                      <LayoutGrid className="mb-4 h-12 w-12 opacity-20" />
                      <p className="text-lg text-white">No items in this slice</p>
                      <p className="mt-1 text-sm">Adjust the queue or category filter, or capture something new.</p>
                    </div>
                  ) : (
                    <CardView items={filteredItems} onItemClick={handleItemClick} />
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </main>

      {isDetailOpen && selectedItem && (
        <DetailPanel
          item={selectedItem}
          allItems={items}
          onClose={() => {
            setIsDetailOpen(false)
            setSelectedItem(null)
          }}
          onUpdate={handleUpdateItem}
          onDelete={handleDeleteItem}
        />
      )}

      <CaptureModal isOpen={isCaptureOpen} onClose={() => setIsCaptureOpen(false)} onSubmit={handleCreateItem} />
      <QueueCleaner isOpen={isCleanerOpen} onClose={() => setIsCleanerOpen(false)} onCleanupDone={fetchItems} />
    </div>
  )
}

function QueueButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${active ? 'bg-dark-600 text-white' : 'text-gray-400 hover:bg-dark-700 hover:text-white'}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-cyan-400' : 'bg-gray-500'}`} />
      <span className="flex-1 text-left">{label}</span>
      <span className="text-xs text-gray-500">{count}</span>
    </button>
  )
}

function LaneButton({
  active,
  label,
  color,
  count,
  onClick,
}: {
  active: boolean
  label: string
  color: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
        active ? 'bg-dark-600 text-white' : 'text-gray-400 hover:bg-dark-700 hover:text-white'
      }`}
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="flex-1 text-left">{label}</span>
      <span className="text-xs text-gray-500">{count}</span>
    </button>
  )
}

function MetricCard({ icon: Icon, label, value, tone }: { icon: typeof AlertTriangle; label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border border-dark-600 bg-dark-800 p-4">
      <div className="mb-3 flex items-center gap-2 text-gray-400">
        <Icon className="h-4 w-4" />
        <span className="text-sm">{label}</span>
      </div>
      <div className={`text-3xl font-semibold ${tone}`}>{value}</div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-dark-600 bg-dark-800/80 px-2 py-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  )
}

function OperatorListCard({
  title,
  subtitle,
  items,
  onItemClick,
  empty,
  focusColors,
}: {
  title: string
  subtitle: string
  items: Item[]
  onItemClick: (item: Item) => void
  empty: string
  focusColors: Record<string, string>
}) {
  return (
    <section className="rounded-2xl border border-dark-600 bg-dark-800 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-medium text-white">{title}</h3>
          <p className="text-sm text-gray-400">{subtitle}</p>
        </div>
        <span className="rounded-full bg-dark-700 px-2.5 py-1 text-xs text-gray-300">{items.length}</span>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onItemClick(item)}
            className="flex w-full items-start gap-3 rounded-xl border border-dark-600 bg-dark-700 p-3 text-left transition-all hover:border-dark-500 hover:bg-dark-600"
          >
            <span
              className="mt-1 h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: focusColors[item.focus_area] ?? '#6b7280' }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-white">{item.title}</span>
                <span className="rounded bg-dark-800 px-1.5 py-0.5 text-[10px] text-gray-400">{item.status}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-gray-400">{summarizeItem(item)}</p>
            </div>
            <span className={`text-xs ${getAgeIndicator(item).color}`}>{getAgeIndicator(item).label}</span>
          </button>
        ))}

        {items.length === 0 && <div className="rounded-xl border border-dark-600 bg-dark-700 p-4 text-sm text-gray-400">{empty}</div>}
      </div>
    </section>
  )
}
