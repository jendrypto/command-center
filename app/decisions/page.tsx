'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  Search, 
  GitCommit,
  CheckCircle,
  XCircle,
  Clock,
  ArrowRight,
  Link as LinkIcon,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Filter
} from 'lucide-react'
import Link from 'next/link'

interface Decision {
  id: number
  title: string
  question: string
  options_considered: string[]
  choice_made: string
  reasoning: string
  decision_date: string
  outcome?: string
  outcome_date?: string
  superseded_by?: number
  tags: string[]
  status: string
  related_items: number[]
}

export default function DecisionsPage() {
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [filteredDecisions, setFilteredDecisions] = useState<Decision[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDecision, setSelectedDecision] = useState<Decision | null>(null)
  const [expandedOptions, setExpandedOptions] = useState<number[]>([])
  const [filterType, setFilterType] = useState<'all' | 'pending' | 'complete' | 'superseded'>('all')

  const fetchDecisions = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/decisions')
      const data = await response.json()
      setDecisions(data.decisions || [])
    } catch (error) {
      console.error('Error fetching decisions:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDecisions()
  }, [fetchDecisions])

  useEffect(() => {
    let filtered = decisions

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(d =>
        d.title.toLowerCase().includes(q) ||
        d.question.toLowerCase().includes(q) ||
        d.reasoning.toLowerCase().includes(q) ||
        (d.choice_made || '').toLowerCase().includes(q) ||
        (d.tags || []).some(t => t.toLowerCase().includes(q))
      )
    }

    if (filterType === 'pending') {
      filtered = filtered.filter(d => !d.outcome && !d.superseded_by)
    } else if (filterType === 'complete') {
      filtered = filtered.filter(d => d.outcome && !d.superseded_by)
    } else if (filterType === 'superseded') {
      filtered = filtered.filter(d => d.superseded_by)
    }

    setFilteredDecisions(filtered)
  }, [decisions, searchQuery, filterType])

  const toggleOptions = (id: number) => {
    setExpandedOptions(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const stats = {
    total: decisions.length,
    pending: decisions.filter(d => !d.outcome && !d.superseded_by).length,
    complete: decisions.filter(d => d.outcome && !d.superseded_by).length,
    superseded: decisions.filter(d => d.superseded_by).length,
  }

  return (
    <div className="min-h-screen bg-dark-900 text-white p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex items-center gap-3 mb-2">
          <GitCommit className="w-8 h-8 text-blue-500" />
          <h1 className="text-3xl font-bold">Decision Trace</h1>
        </div>
        <p className="text-gray-400">
          Query any decision we made — see the question, alternatives, reasoning, and outcome.
        </p>
      </div>

      {/* Stats */}
      <div className="max-w-6xl mx-auto grid grid-cols-4 gap-4 mb-8">
        <div className="bg-dark-800 rounded-lg p-4 border border-dark-600">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-sm text-gray-400">Total Decisions</div>
        </div>
        <div className="bg-dark-800 rounded-lg p-4 border border-dark-600">
          <div className="text-2xl font-bold text-yellow-400">{stats.pending}</div>
          <div className="text-sm text-gray-400">Pending Outcome</div>
        </div>
        <div className="bg-dark-800 rounded-lg p-4 border border-dark-600">
          <div className="text-2xl font-bold text-green-400">{stats.complete}</div>
          <div className="text-sm text-gray-400">With Outcome</div>
        </div>
        <div className="bg-dark-800 rounded-lg p-4 border border-dark-600">
          <div className="text-2xl font-bold text-red-400">{stats.superseded}</div>
          <div className="text-sm text-gray-400">Superseded</div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="max-w-6xl mx-auto mb-6 flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Search decisions (e.g., 'kimi', 'pricing', 'model')..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-dark-800 border border-dark-600 rounded-lg py-3 pl-12 pr-4 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'pending', 'complete', 'superseded'] as const).map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-4 py-2 rounded-lg border transition-colors capitalize ${
                filterType === type
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-dark-800 border-dark-600 text-gray-400 hover:border-gray-500'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Decisions List */}
      <div className="max-w-6xl mx-auto space-y-4">
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
            Loading decisions...
          </div>
        ) : filteredDecisions.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <GitCommit className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg">No decisions found</p>
            <p className="text-sm mt-2">
              {searchQuery || filterType !== 'all' 
                ? 'Try adjusting your search or filters'
                : 'Decisions will appear here when captured'}
            </p>
          </div>
        ) : (
          filteredDecisions.map(decision => (
            <div
              key={decision.id}
              className={`bg-dark-800 rounded-lg border transition-all ${
                selectedDecision?.id === decision.id
                  ? 'border-blue-500 ring-1 ring-blue-500'
                  : 'border-dark-600 hover:border-dark-500'
              }`}
            >
              {/* Header */}
              <div
                className="p-6 cursor-pointer"
                onClick={() => setSelectedDecision(
                  selectedDecision?.id === decision.id ? null : decision
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold">{decision.title}</h3>
                      <div className="flex gap-2">
                        {!decision.outcome && !decision.superseded_by && (
                          <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Pending
                          </span>
                        )}
                        {decision.outcome && !decision.superseded_by && (
                          <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Complete
                          </span>
                        )}
                        {decision.superseded_by && (
                          <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full flex items-center gap-1">
                            <XCircle className="w-3 h-3" />
                            Superseded
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-gray-400 mb-3">{decision.question}</p>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>{formatDate(decision.decision_date)}</span>
                      {(decision.options_considered || []).length > 0 && (
                        <span>{(decision.options_considered || []).length} options considered</span>
                      )}
                      {(decision.related_items || []).length > 0 && (
                        <span className="flex items-center gap-1">
                          <LinkIcon className="w-3 h-3" />
                          {(decision.related_items || []).length} connections
                        </span>
                      )}
                    </div>
                  </div>
                  <button className="p-2 hover:bg-dark-700 rounded-lg transition-colors">
                    {selectedDecision?.id === decision.id ? (
                      <ChevronUp className="w-5 h-5" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded Details */}
              {selectedDecision?.id === decision.id && (
                <div className="px-6 pb-6 border-t border-dark-700">
                  {/* Choice Made */}
                  <div className="mt-4">
                    <div className="text-sm text-gray-500 mb-1">Choice Made</div>
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-blue-100">
                      {decision.choice_made}
                    </div>
                  </div>

                  {/* Reasoning */}
                  <div className="mt-4">
                    <div className="text-sm text-gray-500 mb-1">Reasoning</div>
                    <div className="text-gray-300 whitespace-pre-wrap">{decision.reasoning}</div>
                  </div>

                  {/* Options Considered */}
                  {(decision.options_considered || []).length > 0 && (
                    <div className="mt-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleOptions(decision.id)
                        }}
                        className="flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors mb-2"
                      >
                        <Filter className="w-4 h-4" />
                        Options Considered ({(decision.options_considered || []).length})
                        {expandedOptions.includes(decision.id) ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      {expandedOptions.includes(decision.id) && (
                        <div className="space-y-2">
                          {(decision.options_considered || []).map((opt, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-3 text-gray-400"
                            >
                              <ArrowRight className="w-4 h-4 text-gray-600" />
                              {opt}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Outcome (if recorded) */}
                  {decision.outcome && (
                    <div className="mt-4">
                      <div className="text-sm text-gray-500 mb-1">
                        Outcome
                        {decision.outcome_date && (
                          <span className="text-gray-600 ml-2">
                            ({formatDate(decision.outcome_date)})
                          </span>
                        )}
                      </div>
                      <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-100">
                        {decision.outcome}
                      </div>
                    </div>
                  )}

                  {/* Superseded Notice */}
                  {decision.superseded_by && (
                    <div className="mt-4">
                      <div className="text-sm text-gray-500 mb-1">Status</div>
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-100">
                        Superseded by decision #{decision.superseded_by}
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(decision.tags || []).map(tag => (
                      <span
                        key={tag}
                        className="px-2 py-1 bg-dark-700 rounded text-xs text-gray-400"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>

                  {/* Related Items */}
                  {(decision.related_items || []).length > 0 && (
                    <div className="mt-4">
                      <div className="text-sm text-gray-500 mb-2">Related Items</div>
                      <div className="flex flex-wrap gap-2">
                        {(decision.related_items || []).map(itemId => (
                          <Link
                            key={itemId}
                            href={`/?item=${itemId}`}
                            className="px-3 py-1.5 bg-dark-700 hover:bg-dark-600 rounded-lg text-sm text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-2"
                          >
                            <LinkIcon className="w-3 h-3" />
                            Item #{itemId}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="max-w-6xl mx-auto mt-12 pt-8 border-t border-dark-700 text-center text-gray-500">
        <p className="text-sm">
          Decisions are stored in Command Center with full traceability.
        </p>
        <p className="text-xs mt-2">
          Query via API: <code className="bg-dark-800 px-2 py-1 rounded">GET /api/decisions?q=keyword</code>
        </p>
      </div>
    </div>
  )
}
