'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Brain, CalendarDays, GitCommit, Lightbulb, MessageSquare, Search, FileText, Eye } from 'lucide-react'
import config from '@/command-space.config'
import type { FocusArea, Item } from '@/lib/db'

const categoryLabels = {
  conversations: 'Conversations',
  decisions: 'Decisions',
  ideas: 'Ideas',
  research: 'Research',
  bookmarks: 'Bookmarks',
}

const categoryIcons = {
  conversations: MessageSquare,
  decisions: GitCommit,
  ideas: Lightbulb,
  research: FileText,
  bookmarks: Eye,
}

function dateKey(value?: string | null) {
  if (!value) return 'unknown'
  return new Date(value).toISOString().slice(0, 10)
}

function prettyDate(key: string) {
  if (key === 'unknown') return 'Unknown date'
  return new Date(`${key}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function summarize(item: Item) {
  const raw = item.summary || item.attention_reason || item.content || ''
  return raw.length > 160 ? `${raw.slice(0, 160)}…` : raw
}

export default function DailyMemoryPage() {
  const [items, setItems] = useState<Item[]>([])
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [focusFilter, setFocusFilter] = useState<'all' | FocusArea>('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  const focusOptions = useMemo(
    () => [{ id: 'all', label: 'All Lanes' }, ...config.focusAreas.map((area) => ({ id: area.id, label: area.label }))],
    []
  )
  const focusLabelById = useMemo(
    () => Object.fromEntries(focusOptions.map((opt) => [opt.id, opt.label])),
    [focusOptions]
  )

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const res = await fetch('/api/items')
        const data = await res.json()
        const allItems = (data.items || []) as Item[]
        setItems(allItems)
        const latest = [...new Set(allItems.map((item) => dateKey(item.created_at)))].sort().reverse()[0]
        if (latest) setSelectedDate(latest)
      } finally {
        setLoading(false)
      }
    }
    fetchItems()
  }, [])

  const dateOptions = useMemo(() => [...new Set(items.map((item) => dateKey(item.created_at)))].sort().reverse(), [items])

  const filteredByDate = useMemo(() => {
    return items.filter((item) => {
      if (selectedDate && dateKey(item.created_at) !== selectedDate) return false
      if (focusFilter !== 'all' && item.focus_area !== focusFilter) return false
      if (query) {
        const hay = `${item.title} ${item.content} ${item.tags.join(' ')}`.toLowerCase()
        if (!hay.includes(query.toLowerCase())) return false
      }
      return true
    })
  }, [items, selectedDate, focusFilter, query])

  const grouped = useMemo(() => ({
    conversations: filteredByDate.filter((item) => item.category === 'conversations'),
    decisions: filteredByDate.filter((item) => item.category === 'decisions'),
    ideas: filteredByDate.filter((item) => item.category === 'ideas'),
    research: filteredByDate.filter((item) => item.category === 'research'),
    bookmarks: filteredByDate.filter((item) => item.category === 'bookmarks'),
  }), [filteredByDate])

  const totals = {
    conversations: grouped.conversations.length,
    decisions: grouped.decisions.length,
    ideas: grouped.ideas.length,
    research: grouped.research.length,
    bookmarks: grouped.bookmarks.length,
  }

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-gray-400">
              <Brain className="h-4 w-4 text-cyan-400" />
              <span>{config.dashboard.title}</span>
            </div>
            <h1 className="text-2xl font-semibold">Daily Memory</h1>
            <p className="text-sm text-gray-400">Every day, every discussion, organized by date and lane.</p>
          </div>
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-dark-600 bg-dark-800 px-4 py-2 text-sm text-gray-200 hover:bg-dark-700">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-[300px_1fr]">
          <div className="rounded-2xl border border-dark-600 bg-dark-800 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm text-gray-300">
              <CalendarDays className="h-4 w-4 text-cyan-400" />
              <span>Day selector</span>
            </div>
            <div className="space-y-2">
              {dateOptions.map((key) => (
                <button
                  key={key}
                  onClick={() => setSelectedDate(key)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-all ${selectedDate === key ? 'bg-dark-600 text-white' : 'text-gray-400 hover:bg-dark-700 hover:text-white'}`}
                >
                  {prettyDate(key)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-dark-600 bg-dark-800 p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <div>
                  <div className="text-sm text-gray-400">Selected day</div>
                  <div className="mt-1 text-lg font-medium">{selectedDate ? prettyDate(selectedDate) : 'No day selected'}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {focusOptions.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setFocusFilter(option.id as 'all' | FocusArea)}
                      className={`rounded-full px-3 py-1 text-xs transition-all ${focusFilter === option.id ? 'bg-cyan-500 text-black' : 'bg-dark-700 text-gray-300 hover:bg-dark-600'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search this day..."
                  className="w-full rounded-xl border border-dark-600 bg-dark-700 py-2.5 pl-10 pr-4 text-sm text-white outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-5">
              {Object.entries(totals).map(([key, value]) => {
                const Icon = categoryIcons[key as keyof typeof categoryIcons]
                return (
                  <div key={key} className="rounded-2xl border border-dark-600 bg-dark-800 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm text-gray-400">
                      <Icon className="h-4 w-4" />
                      <span>{categoryLabels[key as keyof typeof categoryLabels]}</span>
                    </div>
                    <div className="text-2xl font-semibold text-white">{value}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-dark-600 bg-dark-800 p-6 text-gray-400">Loading daily memory…</div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            <CategorySection title="Conversations" items={grouped.conversations} focusLabelById={focusLabelById} />
            <CategorySection title="Decisions" items={grouped.decisions} focusLabelById={focusLabelById} />
            <CategorySection title="Ideas" items={grouped.ideas} focusLabelById={focusLabelById} />
            <CategorySection title="Research" items={grouped.research} focusLabelById={focusLabelById} />
            <CategorySection title="Bookmarks" items={grouped.bookmarks} focusLabelById={focusLabelById} />
          </div>
        )}
      </div>
    </div>
  )
}

function CategorySection({
  title,
  items,
  focusLabelById,
}: {
  title: string
  items: Item[]
  focusLabelById: Record<string, string>
}) {
  return (
    <section className="rounded-2xl border border-dark-600 bg-dark-800 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium text-white">{title}</h2>
        <span className="rounded-full bg-dark-700 px-2.5 py-1 text-xs text-gray-300">{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-dark-600 bg-dark-700 p-3">
            <div className="mb-1 flex items-center gap-2">
              <div className="text-sm font-medium text-white">{item.title}</div>
              <span className="rounded bg-dark-800 px-1.5 py-0.5 text-[10px] text-gray-400">
                {focusLabelById[item.focus_area] ?? item.focus_area}
              </span>
            </div>
            <p className="text-xs text-gray-400">{summarize(item)}</p>
          </div>
        ))}
        {items.length === 0 && <div className="rounded-xl border border-dark-600 bg-dark-700 p-4 text-sm text-gray-500">Nothing logged here for this day.</div>}
      </div>
    </section>
  )
}
