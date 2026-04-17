'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Archive,
  ArrowDownToLine,
  BookOpen,
  Check,
  Clock,
  Copy,
  Loader2,
  RefreshCw,
  Trash2,
  Unlink,
  X,
} from 'lucide-react'
import { Item } from '@/lib/db'
import { CleanerDuplicateGroup, QueueCleanerReport } from '@/lib/queue-cleaner'
import { getAgeIndicator } from '@/lib/ai'

type Tab = 'stale' | 'duplicates' | 'heartbeats' | 'orphaned'

export default function QueueCleaner({
  isOpen,
  onClose,
  onCleanupDone,
}: {
  isOpen: boolean
  onClose: () => void
  onCleanupDone: () => void
}) {
  const [tab, setTab] = useState<Tab>('stale')
  const [report, setReport] = useState<QueueCleanerReport | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [applying, setApplying] = useState(false)
  const [lastAction, setLastAction] = useState<string | null>(null)

  const runScan = useCallback(async () => {
    setIsScanning(true)
    setSelected(new Set())
    setLastAction(null)
    try {
      const res = await fetch('/api/queue-cleaner')
      const data = await res.json()
      setReport(data)
    } catch (err) {
      console.error('Scan failed:', err)
    } finally {
      setIsScanning(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) runScan()
  }, [isOpen, runScan])

  if (!isOpen) return null

  const totalIssues =
    (report?.summary.staleItems || 0) +
    (report?.summary.duplicateGroups || 0) +
    (report?.summary.noisyHeartbeatGroups || 0) +
    (report?.summary.orphanedItems || 0)

  const currentItems: Item[] =
    tab === 'stale'
      ? report?.staleItems || []
      : tab === 'orphaned'
        ? report?.orphanedItems || []
        : []

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    const ids = currentItems.map((i) => i.id)
    setSelected((prev) => {
      const allSelected = ids.every((id) => prev.has(id))
      if (allSelected) return new Set()
      return new Set(ids)
    })
  }

  const handleDuplicateArchive = async (group: CleanerDuplicateGroup) => {
    setApplying(true)
    try {
      const res = await fetch('/api/queue-cleaner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'archive-duplicate-group',
          itemIds: group.itemIds,
          primaryId: group.suggestedPrimaryId,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setLastAction(`Archived ${data.result.archivedIds.length} duplicate${data.result.archivedIds.length === 1 ? '' : 's'}, kept #${group.suggestedPrimaryId}`)
        setReport(data.report)
        onCleanupDone()
      }
    } catch (err) {
      console.error('Duplicate archive failed:', err)
    } finally {
      setApplying(false)
    }
  }

  const handleHeartbeatDemote = async (itemIds: number[]) => {
    setApplying(true)
    try {
      const res = await fetch('/api/queue-cleaner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'demote-heartbeat-group',
          itemIds,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setLastAction(`${data.result.updatedIds.length} heartbeat item${data.result.updatedIds.length === 1 ? '' : 's'} moved to reference`)
        setReport(data.report)
        onCleanupDone()
      }
    } catch (err) {
      console.error('Heartbeat demotion failed:', err)
    } finally {
      setApplying(false)
    }
  }

  const applyAction = async (action: 'archive' | 'delete' | 'reference') => {
    if (selected.size === 0) return
    setApplying(true)
    try {
      const res = await fetch('/api/queue-cleaner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: Array.from(selected) }),
      })
      const data = await res.json()
      if (data.success) {
        setLastAction(`${data.summary.succeeded} item${data.summary.succeeded === 1 ? '' : 's'} ${action === 'delete' ? 'deleted' : action === 'archive' ? 'archived' : 'moved to reference'}`)
        setSelected(new Set())
        setReport(data.report)
        onCleanupDone()
      }
    } catch (err) {
      console.error('Action failed:', err)
    } finally {
      setApplying(false)
    }
  }

  const tabConfig: { key: Tab; label: string; count: number; icon: typeof Clock }[] = [
    { key: 'stale', label: 'Stale', count: report?.summary.staleItems || 0, icon: Clock },
    { key: 'duplicates', label: 'Duplicates', count: report?.summary.duplicateGroups || 0, icon: Copy },
    { key: 'heartbeats', label: 'Heartbeats', count: report?.summary.noisyHeartbeatGroups || 0, icon: ArrowDownToLine },
    { key: 'orphaned', label: 'Orphaned', count: report?.summary.orphanedItems || 0, icon: Unlink },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-dark-600 bg-dark-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-dark-600 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Queue Cleaner</h2>
            <p className="text-sm text-gray-400">
              {isScanning
                ? 'Scanning workspace...'
                : `${totalIssues} cleanup candidate${totalIssues === 1 ? '' : 's'} found`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runScan}
              disabled={isScanning}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-dark-700 hover:text-white disabled:opacity-50"
              title="Re-scan"
            >
              <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-dark-700 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex border-b border-dark-600">
          {tabConfig.map(({ key, label, count, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setTab(key)
                setSelected(new Set())
              }}
              className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm transition-all ${
                tab === key
                  ? 'border-b-2 border-cyan-400 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {count > 0 && (
                <span className="rounded-full bg-dark-700 px-2 py-0.5 text-xs">{count}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isScanning ? (
            <div className="flex h-40 items-center justify-center text-gray-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Scanning...
            </div>
          ) : tab === 'duplicates' ? (
            <DuplicatesView
              groups={report?.duplicateGroups || []}
              applying={applying}
              onArchiveGroup={handleDuplicateArchive}
            />
          ) : tab === 'heartbeats' ? (
            <HeartbeatGroupsView
              groups={report?.noisyHeartbeatGroups || []}
              applying={applying}
              onDemoteGroup={handleHeartbeatDemote}
            />
          ) : (
            <ItemListView
              items={currentItems}
              selected={selected}
              onToggle={toggleSelect}
              onSelectAll={selectAll}
              emptyLabel={
                tab === 'stale'
                  ? 'No stale items. Workspace is fresh.'
                  : 'No orphaned items found.'
              }
            />
          )}
        </div>

        {lastAction && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-emerald-900/30 px-3 py-2 text-sm text-emerald-300">
            <Check className="h-4 w-4" />
            {lastAction}
          </div>
        )}

        {tab !== 'duplicates' && tab !== 'heartbeats' && (
          <div className="flex items-center justify-between border-t border-dark-600 px-6 py-4">
            <span className="text-sm text-gray-400">
              {selected.size > 0
                ? `${selected.size} selected`
                : 'Select items to take action'}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => applyAction('reference')}
                disabled={selected.size === 0 || applying}
                className="flex items-center gap-2 rounded-lg border border-dark-600 px-3 py-2 text-sm text-gray-300 transition-all hover:bg-dark-700 disabled:opacity-40"
              >
                <BookOpen className="h-4 w-4" />
                Reference
              </button>
              <button
                onClick={() => applyAction('archive')}
                disabled={selected.size === 0 || applying}
                className="flex items-center gap-2 rounded-lg bg-amber-600/20 px-3 py-2 text-sm text-amber-300 transition-all hover:bg-amber-600/30 disabled:opacity-40"
              >
                <Archive className="h-4 w-4" />
                Archive
              </button>
              <button
                onClick={() => applyAction('delete')}
                disabled={selected.size === 0 || applying}
                className="flex items-center gap-2 rounded-lg bg-red-600/20 px-3 py-2 text-sm text-red-300 transition-all hover:bg-red-600/30 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ItemListView({
  items,
  selected,
  onToggle,
  onSelectAll,
  emptyLabel,
}: {
  items: Item[]
  selected: Set<number>
  onToggle: (id: number) => void
  onSelectAll: () => void
  emptyLabel: string
}) {
  if (items.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-gray-400">
        {emptyLabel}
      </div>
    )
  }

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id))

  return (
    <div className="space-y-2">
      <button
        onClick={onSelectAll}
        className="mb-2 text-xs text-cyan-400 hover:text-cyan-300"
      >
        {allSelected ? 'Deselect all' : `Select all ${items.length}`}
      </button>
      {items.map((item) => (
        <label
          key={item.id}
          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all ${
            selected.has(item.id)
              ? 'border-cyan-500/40 bg-cyan-900/10'
              : 'border-dark-600 bg-dark-700 hover:border-dark-500'
          }`}
        >
          <input
            type="checkbox"
            checked={selected.has(item.id)}
            onChange={() => onToggle(item.id)}
            className="mt-1 h-4 w-4 rounded border-dark-500 bg-dark-600 text-cyan-500 accent-cyan-500"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-white">{item.title}</span>
              <span className="rounded bg-dark-800 px-1.5 py-0.5 text-[10px] text-gray-400">
                {item.status}
              </span>
              <span className="rounded bg-dark-800 px-1.5 py-0.5 text-[10px] text-gray-400">
                {item.category}
              </span>
            </div>
            <p className="mt-1 line-clamp-1 text-xs text-gray-500">
              {item.summary || item.content}
            </p>
          </div>
          <span className={`whitespace-nowrap text-xs ${getAgeIndicator(item).color}`}>
            {getAgeIndicator(item).label}
          </span>
        </label>
      ))}
    </div>
  )
}

function HeartbeatGroupsView({
  groups,
  applying,
  onDemoteGroup,
}: {
  groups: Array<{ title: string; itemIds: number[]; items: Item[]; reason: string }>
  applying: boolean
  onDemoteGroup: (itemIds: number[]) => void
}) {
  if (groups.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-gray-400">
        No heartbeat noise groups found.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        These heartbeat captures look repetitive. Demote them to reference so they stop clogging the action queue.
      </p>
      {groups.map((group) => (
        <div key={group.itemIds.join('-')} className="rounded-xl border border-dark-600 bg-dark-700/60 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-white">{group.title}</div>
              <div className="text-xs text-gray-400">{group.reason}</div>
            </div>
            <button
              onClick={() => onDemoteGroup(group.itemIds)}
              disabled={applying}
              className="flex items-center gap-2 rounded-lg bg-slate-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-500 disabled:bg-dark-600"
            >
              {applying ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ArrowDownToLine className="h-3 w-3" />
              )}
              Demote to reference
            </button>
          </div>
          <div className="space-y-1">
            {group.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg bg-dark-800 px-3 py-2 text-xs text-gray-300">
                <div className="min-w-0 flex-1">
                  <div className="truncate">#{item.id} · {item.title}</div>
                  <div className="text-[10px] text-gray-500">{item.category} · {item.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function DuplicatesView({
  groups,
  applying,
  onArchiveGroup,
}: {
  groups: CleanerDuplicateGroup[]
  applying: boolean
  onArchiveGroup: (group: CleanerDuplicateGroup) => void
}) {
  if (groups.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-gray-400">
        No duplicates found. Workspace is clean.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        Fuzzy-matched duplicate groups. Click &quot;Keep 1&quot; to archive extras and link them to the primary.
      </p>
      {groups.map((group) => {
        const primary = group.items.find((i) => i.id === group.suggestedPrimaryId)
        return (
          <div key={group.key} className="rounded-xl border border-dark-600 bg-dark-700/60 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-white">
                  {primary?.title || group.normalizedTitle}
                </div>
                <div className="text-xs text-gray-400">{group.reason}</div>
              </div>
              <button
                onClick={() => onArchiveGroup(group)}
                disabled={applying}
                className="flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-amber-500 disabled:bg-dark-600"
              >
                {applying ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Archive className="h-3 w-3" />
                )}
                Keep 1, archive dupes
              </button>
            </div>
            <div className="space-y-1">
              {group.items.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${
                    item.id === group.suggestedPrimaryId
                      ? 'border border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                      : 'bg-dark-800 text-gray-300'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate">#{item.id} · {item.title}</div>
                    <div className="text-[10px] text-gray-500">{item.category} · {item.status}</div>
                  </div>
                  {item.id === group.suggestedPrimaryId && (
                    <span className="ml-2 rounded bg-cyan-500/20 px-2 py-1 text-[10px]">keep</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
