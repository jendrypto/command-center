'use client'

import { useMemo } from 'react'
import {
  AlertCircle,
  Brain,
  Clock,
  Eye,
  Flag,
  Link2,
  MoreHorizontal,
  Rocket,
  ScrollText,
} from 'lucide-react'
import { Item, ItemStatus } from '@/lib/db'
import { getAgeIndicator } from '@/lib/ai'

interface CardViewProps {
  items: Item[]
  onItemClick: (item: Item) => void
}

const columns: ItemStatus[] = ['candidate', 'raw', 'clustered', 'reference', 'promoted', 'archived']

const columnLabels: Record<ItemStatus, string> = {
  raw: 'Raw Capture',
  clustered: 'Clustered',
  candidate: 'Action Candidates',
  promoted: 'Promoted',
  reference: 'Reference',
  archived: 'Archived',
}

const columnColors: Record<ItemStatus, string> = {
  raw: 'border-gray-500',
  clustered: 'border-blue-500',
  candidate: 'border-amber-500',
  promoted: 'border-green-500',
  reference: 'border-purple-500',
  archived: 'border-slate-500',
}

const columnIcons: Record<ItemStatus, typeof Brain> = {
  raw: ScrollText,
  clustered: Brain,
  candidate: Flag,
  promoted: Rocket,
  reference: Eye,
  archived: AlertCircle,
}

const categoryColors = {
  ideas: 'bg-blue-500',
  conversations: 'bg-green-500',
  research: 'bg-purple-500',
  bookmarks: 'bg-orange-500',
  decisions: 'bg-red-500',
}

const categoryLabels = {
  ideas: 'Idea',
  conversations: 'Chat',
  research: 'Research',
  bookmarks: 'Bookmark',
  decisions: 'Decision',
}

export default function CardView({ items, onItemClick }: CardViewProps) {
  const itemsByColumn = useMemo(() => {
    return columns.reduce((acc, column) => {
      acc[column] = items.filter((item) => item.status === column)
      return acc
    }, {} as Record<ItemStatus, Item[]>)
  }, [items])

  return (
    <div className="h-full overflow-x-auto overflow-y-hidden">
      <div className="flex h-full gap-4 p-4 min-w-max">
        {columns.map((column) => {
          const Icon = columnIcons[column]
          return (
            <div
              key={column}
              className={`w-80 flex-shrink-0 flex flex-col bg-dark-800 rounded-lg border-t-4 ${columnColors[column]}`}
            >
              <div className="p-3 border-b border-dark-600">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-gray-300" />
                    <h3 className="font-medium text-sm text-gray-200">{columnLabels[column]}</h3>
                  </div>
                  <span className="text-xs text-gray-500 bg-dark-700 px-2 py-1 rounded-full">
                    {itemsByColumn[column].length}
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {itemsByColumn[column].map((item) => (
                  <Card key={item.id} item={item} onClick={() => onItemClick(item)} />
                ))}

                {itemsByColumn[column].length === 0 && (
                  <div className="text-center py-8 text-gray-500 text-sm">No items</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Card({ item, onClick }: { item: Item; onClick: () => void }) {
  const ageIndicator = getAgeIndicator(item)
  const connectionCount = (item as any).connectionCount || 0
  const isStale = ageIndicator.color === 'text-red-400'

  return (
    <div
      onClick={onClick}
      className="group bg-dark-700 hover:bg-dark-600 border border-dark-600 hover:border-dark-500 rounded-lg p-3 cursor-pointer transition-all hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${categoryColors[item.category]}`} />
          <span className="text-[10px] uppercase tracking-wide text-gray-400">
            {categoryLabels[item.category]}
          </span>
          {item.needs_review && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
              review
            </span>
          )}
        </div>
        <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-dark-500 rounded transition-all">
          <MoreHorizontal className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <h4 className="font-medium text-sm text-white mb-2 line-clamp-2">{item.title}</h4>

      <p className="text-xs text-gray-400 line-clamp-3 mb-3">
        {item.summary || item.content.slice(0, 120)}...
      </p>

      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {item.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-dark-800 text-gray-400 rounded">
              {tag}
            </span>
          ))}
          {item.tags.length > 3 && (
            <span className="text-[10px] text-gray-500">+{item.tags.length - 3}</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] text-gray-500 pt-2 border-t border-dark-600">
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-1 ${ageIndicator.color}`}>
            <Clock className="w-3 h-3" />
            {ageIndicator.label}
          </span>

          {connectionCount > 0 && (
            <span className="flex items-center gap-1 text-gray-400">
              <Link2 className="w-3 h-3" />
              {connectionCount}
            </span>
          )}
        </div>

        {isStale && item.status !== 'archived' && item.status !== 'promoted' && (
          <span className="flex items-center gap-1 text-red-400">
            <AlertCircle className="w-3 h-3" />
            stale
          </span>
        )}
      </div>
    </div>
  )
}
