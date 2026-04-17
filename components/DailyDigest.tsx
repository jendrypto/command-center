'use client'

import {
  AlertTriangle,
  ArrowRight,
  Brain,
  Flag,
  GitCommit,
  Inbox,
  MessageSquare,
  Eye,
  FileText,
  Lightbulb,
  Sparkles,
  X,
} from 'lucide-react'
import { Item } from '@/lib/db'
import { DailyDigest } from '@/lib/ai'
import config from '@/command-space.config'

const AGENT_NAME = config.agent.name

interface DailyDigestPanelProps {
  digest: DailyDigest
  onClose: () => void
  onItemClick: (item: Item) => void
}

const categoryIcons = {
  ideas: Lightbulb,
  conversations: MessageSquare,
  research: FileText,
  bookmarks: Eye,
  decisions: GitCommit,
}

const categoryColors = {
  ideas: 'bg-blue-500',
  conversations: 'bg-green-500',
  research: 'bg-purple-500',
  bookmarks: 'bg-orange-500',
  decisions: 'bg-red-500',
}

export default function DailyDigestPanel({ digest, onClose, onItemClick }: DailyDigestPanelProps) {
  const hasAttentionItems = digest.needsReviewCount > 0 || digest.candidateCount > 0 || digest.staleItems.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-dark-800 border border-dark-600 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between p-4 border-b border-dark-600 bg-gradient-to-r from-blue-600/20 to-purple-600/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-xl">{AGENT_NAME} Control Room</h2>
              <p className="text-sm text-gray-400">
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-dark-700 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(80vh-80px)] p-4 space-y-6">
          <div className="grid grid-cols-4 gap-3">
            <MetricCard label="Needs Review" value={digest.needsReviewCount} accent="text-amber-400" />
            <MetricCard label="Candidates" value={digest.candidateCount} accent="text-blue-400" />
            <MetricCard label="Raw" value={digest.rawCount} accent="text-white" />
            <MetricCard label="Promoted" value={digest.promotedCount} accent="text-green-400" />
          </div>

          {hasAttentionItems && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="font-semibold text-amber-300">Exceptions you should notice</h3>
              </div>
              <p className="text-sm text-gray-300">
                {digest.needsReviewCount} review-needed item(s), {digest.candidateCount} action candidate(s), and{' '}
                {digest.staleItems.length} stale item(s) are waiting on a decision or confirmation.
              </p>
            </div>
          )}

          {digest.exceptionItems.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-200 mb-3 flex items-center gap-2">
                <Flag className="w-4 h-4 text-amber-400" />
                Review Queue ({digest.exceptionItems.length})
              </h3>
              <div className="space-y-2">
                {digest.exceptionItems.map((item) => (
                  <DigestItem key={item.id} item={item} onClick={() => onItemClick(item)} />
                ))}
              </div>
            </div>
          )}

          {digest.connectionSuggestions.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-200 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                Best Connection Suggestions
              </h3>
              <div className="space-y-3">
                {digest.connectionSuggestions.map(({ item, suggestions }) => (
                  <div key={item.id} className="bg-dark-700 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full ${categoryColors[item.category]}`} />
                      <span className="font-medium text-sm">{item.title}</span>
                    </div>
                    <div className="space-y-1">
                      {suggestions.slice(0, 2).map(({ item: relatedItem, reason }) => (
                        <button
                          key={relatedItem.id}
                          onClick={() => onItemClick(relatedItem)}
                          className="w-full flex items-center gap-2 p-2 bg-dark-800 hover:bg-dark-600 rounded text-left transition-colors"
                        >
                          <ArrowRight className="w-3 h-3 text-gray-500" />
                          <span className="text-sm truncate flex-1">{relatedItem.title}</span>
                          <span className="text-xs text-gray-500">{reason}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!hasAttentionItems && digest.newItems.length === 0 && (
            <div className="text-center py-8">
              <Inbox className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">{AGENT_NAME} is caught up. No exceptions need attention.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="bg-dark-700 rounded-lg p-3 text-center">
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  )
}

function DigestItem({ item, onClick }: { item: Item; onClick: () => void }) {
  const Icon = categoryIcons[item.category]
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all bg-dark-700 hover:bg-dark-600"
    >
      <div className={`p-1.5 rounded ${categoryColors[item.category]} bg-opacity-20`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-sm text-white truncate">{item.title}</h4>
        <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{item.summary || item.content.slice(0, 100)}...</p>
        <div className="flex items-center gap-2 mt-2">
          {item.needs_review && (
            <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/15 rounded text-amber-300">needs review</span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 bg-dark-800 rounded text-gray-500">{item.status}</span>
        </div>
      </div>
    </button>
  )
}
