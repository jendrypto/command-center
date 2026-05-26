'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  Check,
  Clock,
  Edit3,
  Eye,
  FileText,
  GitCommit,
  Lightbulb,
  Link2,
  Loader2,
  MessageSquare,
  Plus,
  Sparkles,
  Tag,
  Target,
  Trash2,
  X,
} from 'lucide-react'
import config from '@/command-space.config'
import { FocusArea, Item, ItemDisposition, ItemStatus, OutcomeStatus } from '@/lib/db'
import { findPotentialConnections, getAgeIndicator, extractKeyPoints } from '@/lib/ai'

interface DetailPanelProps {
  item: Item
  allItems: Item[]
  onClose: () => void
  onUpdate: (id: number, updates: Partial<Item>) => void
  onDelete: (id: number) => void
}

const categoryIcons = {
  ideas: Lightbulb,
  conversations: MessageSquare,
  research: FileText,
  bookmarks: Eye,
  decisions: GitCommit,
}

const categoryColors = {
  ideas: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  conversations: 'text-green-400 bg-green-400/10 border-green-400/30',
  research: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
  bookmarks: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  decisions: 'text-red-400 bg-red-400/10 border-red-400/30',
}

const statusLabels: Record<ItemStatus, string> = {
  raw: 'Raw Capture',
  clustered: 'Clustered',
  candidate: 'Action Candidate',
  promoted: 'Promoted',
  reference: 'Reference',
  archived: 'Archived',
}

const dispositionLabels: Record<ItemDisposition, string> = {
  keep_incubating: 'Keep Incubating',
  connect_cluster: 'Connect to Cluster',
  promote: 'Promote',
  reference: 'Reference',
  archive: 'Archive',
  merge_duplicate: 'Merge Duplicate',
}

const outcomeLabels: Record<OutcomeStatus, string> = {
  open: 'Open',
  decided: 'Decided',
  done: 'Done',
  blocked: 'Blocked',
  superseded: 'Superseded',
  dropped: 'Dropped',
}

const PROMOTION_ENABLED = config.promotionTarget.type !== 'none'

function toDatetimeLocal(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 16)
}

export default function DetailPanel({ item, allItems, onClose, onUpdate, onDelete }: DetailPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedTitle, setEditedTitle] = useState(item.title)
  const [editedContent, setEditedContent] = useState(item.content)
  const [editedTags, setEditedTags] = useState(item.tags.join(', '))
  const [editedStatus, setEditedStatus] = useState<ItemStatus>(item.status)
  const [editedDisposition, setEditedDisposition] = useState<ItemDisposition | ''>(item.disposition || '')
  const [editedNeedsReview, setEditedNeedsReview] = useState(item.needs_review)
  const [editedAttentionReason, setEditedAttentionReason] = useState(item.attention_reason || '')
  const [editedClusterKey, setEditedClusterKey] = useState(item.cluster_key || '')
  const [editedFocusArea, setEditedFocusArea] = useState<FocusArea>(item.focus_area)
  const [editedOwner, setEditedOwner] = useState(item.owner || '')
  const [editedRevisitAt, setEditedRevisitAt] = useState(toDatetimeLocal(item.revisit_at))
  const [editedDecisionNeeded, setEditedDecisionNeeded] = useState(item.decision_needed || '')
  const [editedOutcomeStatus, setEditedOutcomeStatus] = useState<OutcomeStatus | ''>(item.outcome_status || '')
  const [editedOutcomeNote, setEditedOutcomeNote] = useState(item.outcome_note || '')
  const [editedEvidence, setEditedEvidence] = useState(item.evidence || '')
  const [editedExecutionTarget, setEditedExecutionTarget] = useState(item.execution_target || item.promotion_target || '')
  const [editedExecutionRef, setEditedExecutionRef] = useState(item.execution_ref || '')
  const [editedExecutionUrl, setEditedExecutionUrl] = useState(item.execution_url || '')
  const [connections, setConnections] = useState<any[]>([])
  const [relatedItems, setRelatedItems] = useState<Array<{ item: Item; reason: string }>>([])
  const [isPromoting, setIsPromoting] = useState(false)
  const [promoteSuccess, setPromoteSuccess] = useState(false)
  const [promoteError, setPromoteError] = useState<string | null>(null)

  const Icon = categoryIcons[item.category]
  const ageIndicator = getAgeIndicator(item)
  const keyPoints = extractKeyPoints(item.content)

  const focusLabels = useMemo<Record<string, string>>(
    () => Object.fromEntries(config.focusAreas.map((area) => [area.id, area.label])),
    []
  )

  useEffect(() => {
    setEditedTitle(item.title)
    setEditedContent(item.content)
    setEditedTags(item.tags.join(', '))
    setEditedStatus(item.status)
    setEditedDisposition(item.disposition || '')
    setEditedNeedsReview(item.needs_review)
    setEditedAttentionReason(item.attention_reason || '')
    setEditedClusterKey(item.cluster_key || '')
    setEditedFocusArea(item.focus_area)
    setEditedOwner(item.owner || '')
    setEditedRevisitAt(toDatetimeLocal(item.revisit_at))
    setEditedDecisionNeeded(item.decision_needed || '')
    setEditedOutcomeStatus(item.outcome_status || '')
    setEditedOutcomeNote(item.outcome_note || '')
    setEditedEvidence(item.evidence || '')
    setEditedExecutionTarget(item.execution_target || item.promotion_target || '')
    setEditedExecutionRef(item.execution_ref || '')
    setEditedExecutionUrl(item.execution_url || '')
  }, [item])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`/api/connections?itemId=${item.id}`)
        const data = await response.json()
        setConnections(data.connections || [])
      } catch (error) {
        console.error('Error fetching connections:', error)
      }

      setRelatedItems(findPotentialConnections(allItems, item))
    }

    fetchData()
  }, [item, allItems])

  const connectedItems = connections
    .map((connection) => {
      const otherId = connection.source_id === item.id ? connection.target_id : connection.source_id
      return allItems.find((candidate) => candidate.id === otherId)
    })
    .filter(Boolean) as Item[]

  const handleSave = () => {
    const tagList = editedTags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)

    onUpdate(item.id, {
      title: editedTitle,
      content: editedContent,
      tags: tagList,
      status: editedStatus,
      disposition: editedDisposition || null,
      needs_review: editedNeedsReview,
      attention_reason: editedAttentionReason || null,
      cluster_key: editedClusterKey || null,
      focus_area: editedFocusArea,
      owner: editedOwner || null,
      revisit_at: editedRevisitAt ? new Date(editedRevisitAt).toISOString() : null,
      decision_needed: editedDecisionNeeded || null,
      outcome_status: editedOutcomeStatus || null,
      outcome_note: editedOutcomeNote || null,
      evidence: editedEvidence || null,
      execution_target: editedExecutionTarget || null,
      execution_ref: editedExecutionRef || null,
      execution_url: editedExecutionUrl || null,
      reviewed_at: new Date().toISOString(),
    })
    setIsEditing(false)
  }

  const handlePromote = async () => {
    if (!PROMOTION_ENABLED) return

    setIsPromoting(true)
    setPromoteError(null)
    try {
      const response = await fetch('/api/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: item.id,
          target: editedExecutionTarget || undefined,
          external_ref: editedExecutionRef || undefined,
          external_url: editedExecutionUrl || undefined,
          owner: editedOwner || undefined,
          evidence: editedEvidence || undefined,
        }),
      })
      const data = await response.json()

      if (response.ok && data.success) {
        setPromoteSuccess(true)
        onUpdate(item.id, data.command_center_item || {
          status: 'promoted',
          disposition: 'promote',
          reviewed_at: new Date().toISOString(),
          needs_review: false,
          attention_reason: null,
        })
        setTimeout(() => setPromoteSuccess(false), 3000)
      } else {
        setPromoteError(data.error || 'Promotion failed')
      }
    } catch (error) {
      setPromoteError(error instanceof Error ? error.message : 'Promotion failed')
    } finally {
      setIsPromoting(false)
    }
  }

  const handleConnect = async (targetId: number) => {
    try {
      const response = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_id: item.id,
          target_id: targetId,
          relationship_type: 'related',
        }),
      })

      if (response.ok) {
        const connResponse = await fetch(`/api/connections?itemId=${item.id}`)
        const data = await connResponse.json()
        setConnections(data.connections || [])
        setRelatedItems((prev) => prev.filter((candidate) => candidate.item.id !== targetId))

        if (item.status === 'raw' || item.status === 'candidate') {
          onUpdate(item.id, {
            status: 'clustered',
            disposition: 'connect_cluster',
            reviewed_at: new Date().toISOString(),
            needs_review: false,
            attention_reason: null,
          })
        }
      }
    } catch (error) {
      console.error('Error creating connection:', error)
    }
  }

  const handleDisconnect = async (targetId: number) => {
    try {
      await fetch(`/api/connections?source=${item.id}&target=${targetId}`, {
        method: 'DELETE',
      })
      setConnections((prev) =>
        prev.filter((connection) => connection.source_id !== targetId && connection.target_id !== targetId)
      )
    } catch (error) {
      console.error('Error deleting connection:', error)
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 w-[520px] bg-dark-800 border-l border-dark-600 shadow-2xl z-40 animate-fade-in overflow-y-auto">
      <div className="sticky top-0 bg-dark-800 border-b border-dark-600 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg border ${categoryColors[item.category]}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs uppercase tracking-wide text-gray-500">{item.category}</span>
            <div className="flex items-center gap-2">
              <span className={`text-xs ${ageIndicator.color}`}>{ageIndicator.label}</span>
              {item.needs_review && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300">
                  needs review
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {!isEditing && (
            <>
              <button onClick={() => setIsEditing(true)} className="p-2 hover:bg-dark-700 rounded-lg transition-colors">
                <Edit3 className="w-4 h-4" />
              </button>
              <button onClick={() => onDelete(item.id)} className="p-2 hover:bg-red-500/20 hover:text-red-400 rounded-lg transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          <button onClick={onClose} className="p-2 hover:bg-dark-700 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {isEditing ? (
          <input
            type="text"
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2.5 text-lg font-medium focus:outline-none focus:border-blue-500"
          />
        ) : (
          <h1 className="text-xl font-semibold">{item.title}</h1>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-dark-700 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Agent Status</div>
            {isEditing ? (
              <select
                value={editedStatus}
                onChange={(e) => setEditedStatus(e.target.value as ItemStatus)}
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-gray-200">{statusLabels[item.status]}</span>
            )}
          </div>

          <div className="bg-dark-700 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Disposition</div>
            {isEditing ? (
              <select
                value={editedDisposition}
                onChange={(e) => setEditedDisposition(e.target.value as ItemDisposition | '')}
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">None</option>
                {Object.entries(dispositionLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-gray-200">
                {item.disposition ? dispositionLabels[item.disposition] : 'Unassigned'}
              </span>
            )}
          </div>
        </div>

        <div className="bg-dark-700 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Strategic Lane</div>
          {isEditing ? (
            <select
              value={editedFocusArea}
              onChange={(e) => setEditedFocusArea(e.target.value)}
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              {config.focusAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-gray-200">{focusLabels[item.focus_area] ?? item.focus_area}</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-dark-700 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Review State</div>
            {isEditing ? (
              <label className="flex items-center gap-2 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={editedNeedsReview}
                  onChange={(e) => setEditedNeedsReview(e.target.checked)}
                />
                Needs manual review
              </label>
            ) : (
              <span className="text-sm text-gray-200">{item.needs_review ? 'Needs manual review' : 'Agent can handle'}</span>
            )}
          </div>

          <div className="bg-dark-700 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Agent Confidence</div>
            <span className="text-sm text-gray-200">
              {item.agent_confidence != null ? `${Math.round(item.agent_confidence * 100)}%` : 'Unset'}
            </span>
          </div>
        </div>

        <div className="bg-dark-700 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-2">Outcome Loop</div>
          {isEditing ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={editedOwner}
                  onChange={(e) => setEditedOwner(e.target.value)}
                  placeholder="owner"
                  className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
                <input
                  type="datetime-local"
                  value={editedRevisitAt}
                  onChange={(e) => setEditedRevisitAt(e.target.value)}
                  className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <select
                value={editedOutcomeStatus}
                onChange={(e) => setEditedOutcomeStatus(e.target.value as OutcomeStatus | '')}
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">No outcome</option>
                {Object.entries(outcomeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={editedDecisionNeeded}
                onChange={(e) => setEditedDecisionNeeded(e.target.value)}
                placeholder="decision needed"
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
              <textarea
                value={editedOutcomeNote}
                onChange={(e) => setEditedOutcomeNote(e.target.value)}
                rows={3}
                placeholder="outcome note"
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
          ) : (
            <div className="text-sm text-gray-300 space-y-1">
              <div>Owner: {item.owner || 'Unassigned'}</div>
              <div>Revisit: {item.revisit_at ? new Date(item.revisit_at).toLocaleString() : 'Not scheduled'}</div>
              <div>Outcome: {item.outcome_status ? outcomeLabels[item.outcome_status] : 'None'}</div>
              <div>Decision: {item.decision_needed || 'None'}</div>
              <div>Note: {item.outcome_note || 'None'}</div>
            </div>
          )}
        </div>

        <div className="bg-dark-700 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-2">Execution Handoff</div>
          {isEditing ? (
            <div className="space-y-2">
              <input
                type="text"
                value={editedExecutionTarget}
                onChange={(e) => setEditedExecutionTarget(e.target.value)}
                placeholder="target"
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={editedExecutionRef}
                  onChange={(e) => setEditedExecutionRef(e.target.value)}
                  placeholder="external ref"
                  className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
                <input
                  type="url"
                  value={editedExecutionUrl}
                  onChange={(e) => setEditedExecutionUrl(e.target.value)}
                  placeholder="external URL"
                  className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <textarea
                value={editedEvidence}
                onChange={(e) => setEditedEvidence(e.target.value)}
                rows={3}
                placeholder="evidence"
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
          ) : (
            <div className="text-sm text-gray-300 space-y-1">
              <div>Target: {item.execution_target || item.promotion_target || 'None'}</div>
              <div>External ref: {item.execution_ref || 'None'}</div>
              <div>
                External URL:{' '}
                {item.execution_url ? (
                  <a href={item.execution_url} target="_blank" rel="noreferrer" className="text-blue-300 hover:text-blue-200">
                    {item.execution_url}
                  </a>
                ) : (
                  'None'
                )}
              </div>
              <div>Evidence: {item.evidence || 'None'}</div>
            </div>
          )}
        </div>

        {PROMOTION_ENABLED && (
          <div className="flex items-center gap-2 justify-end">
            {promoteSuccess ? (
              <span className="flex items-center gap-1 text-green-400 text-sm">
                <Check className="w-4 h-4" />
                Promoted
              </span>
            ) : (
              <>
                {promoteError && (
                  <span className="text-xs text-red-400" title={promoteError}>
                    {promoteError.length > 40 ? `${promoteError.slice(0, 40)}…` : promoteError}
                  </span>
                )}
                <button
                  onClick={handlePromote}
                  disabled={isPromoting || item.status === 'promoted'}
                  className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-dark-600 rounded-lg text-sm font-medium transition-colors"
                >
                  {isPromoting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowUpRight className="w-3 h-3" />}
                  {item.status === 'promoted' ? 'Promoted' : 'Promote'}
                </button>
              </>
            )}
          </div>
        )}

        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Content
          </h3>
          {isEditing ? (
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              rows={8}
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 resize-none"
            />
          ) : (
            <div className="bg-dark-700 rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap">{item.content}</div>
          )}
        </div>

        {item.summary && !isEditing && (
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              Summary
            </h3>
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 text-sm text-purple-200">
              {item.summary}
            </div>
          </div>
        )}

        {!isEditing && keyPoints.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
              <Lightbulb className="w-4 h-4" />
              Key Points
            </h3>
            <ul className="space-y-1.5">
              {keyPoints.map((point, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <span className="text-blue-400 mt-1">•</span>
                  <span className="text-gray-300">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3">
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
              <Target className="w-4 h-4" />
              Strategic Context
            </h3>
            {isEditing ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={editedClusterKey}
                  onChange={(e) => setEditedClusterKey(e.target.value)}
                  placeholder="cluster key"
                  className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  value={editedAttentionReason}
                  onChange={(e) => setEditedAttentionReason(e.target.value)}
                  placeholder="why this needs review"
                  className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            ) : (
              <div className="bg-dark-700 rounded-lg p-3 text-sm text-gray-300 space-y-1">
                <div>Lane: {focusLabels[item.focus_area] ?? item.focus_area}</div>
                <div>Priority score: {item.focus_score}</div>
                <div>Cluster: {item.cluster_key || 'Unassigned'}</div>
                <div>Attention: {item.attention_reason || 'None'}</div>
                <div>Reviewed: {item.reviewed_at ? new Date(item.reviewed_at).toLocaleString() : 'Not reviewed yet'}</div>
              </div>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
            <Tag className="w-4 h-4" />
            Tags
          </h3>
          {isEditing ? (
            <input
              type="text"
              value={editedTags}
              onChange={(e) => setEditedTags(e.target.value)}
              placeholder="tag1, tag2, tag3"
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {item.tags.length > 0 ? (
                item.tags.map((tag) => (
                  <span key={tag} className="px-2.5 py-1 bg-dark-700 rounded-full text-xs text-gray-300">
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-sm text-gray-500">No tags</span>
              )}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            Connected ({connectedItems.length})
          </h3>
          {connectedItems.length > 0 ? (
            <div className="space-y-2">
              {connectedItems.map((connectedItem) => (
                <div key={connectedItem.id} className="flex items-center justify-between bg-dark-700 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      connectedItem.category === 'ideas'
                        ? 'bg-blue-500'
                        : connectedItem.category === 'conversations'
                          ? 'bg-green-500'
                          : connectedItem.category === 'research'
                            ? 'bg-purple-500'
                            : connectedItem.category === 'decisions'
                              ? 'bg-red-500'
                              : 'bg-orange-500'
                    }`} />
                    <span className="text-sm truncate max-w-[220px]">{connectedItem.title}</span>
                  </div>
                  <button onClick={() => handleDisconnect(connectedItem.id)} className="p-1 hover:bg-dark-600 rounded transition-colors">
                    <X className="w-3 h-3 text-gray-500" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No connections yet</p>
          )}
        </div>

        {relatedItems.length > 0 && !isEditing && (
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              Suggested Connections
            </h3>
            <div className="space-y-2">
              {relatedItems.map(({ item: relatedItem, reason }) => (
                <div key={relatedItem.id} className="flex items-center justify-between bg-dark-700/50 border border-dark-600 rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${
                        relatedItem.category === 'ideas'
                          ? 'bg-blue-500'
                          : relatedItem.category === 'conversations'
                            ? 'bg-green-500'
                            : relatedItem.category === 'research'
                              ? 'bg-purple-500'
                              : relatedItem.category === 'decisions'
                                ? 'bg-red-500'
                                : 'bg-orange-500'
                      }`} />
                      <span className="text-sm font-medium truncate">{relatedItem.title}</span>
                    </div>
                    <p className="text-xs text-gray-500">{reason}</p>
                  </div>
                  <button onClick={() => handleConnect(relatedItem.id)} className="p-1.5 hover:bg-blue-500/20 hover:text-blue-400 rounded-lg transition-colors ml-2">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-dark-600">
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Created: {new Date(item.created_at).toLocaleString()}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-1">Updated: {new Date(item.updated_at).toLocaleString()}</div>
        </div>

        {isEditing && (
          <div className="flex gap-3 sticky bottom-0 bg-dark-800 pt-2 pb-4">
            <button onClick={() => setIsEditing(false)} className="flex-1 px-4 py-2.5 bg-dark-700 hover:bg-dark-600 rounded-lg font-medium transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors">
              Save Changes
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
