'use client'

import { useState } from 'react'
import { X, Sparkles, Loader2 } from 'lucide-react'
import { Item } from '@/lib/db'

interface CaptureModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (item: {
    title: string
    content: string
    category: Item['category']
    tags: string[]
    autoAnalyze: boolean
  }) => void
}

const categories: { value: Item['category']; label: string; color: string }[] = [
  { value: 'ideas', label: 'Idea', color: 'bg-blue-500' },
  { value: 'conversations', label: 'Conversation', color: 'bg-green-500' },
  { value: 'research', label: 'Research', color: 'bg-purple-500' },
  { value: 'bookmarks', label: 'Bookmark', color: 'bg-orange-500' },
]

export default function CaptureModal({ isOpen, onClose, onSubmit }: CaptureModalProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<Item['category']>('ideas')
  const [tags, setTags] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [autoAnalyze, setAutoAnalyze] = useState(true)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return

    setIsSubmitting(true)

    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)

    await onSubmit({
      title: title.trim(),
      content: content.trim(),
      category,
      tags: tagList,
      autoAnalyze,
    })

    // Reset form
    setTitle('')
    setContent('')
    setCategory('ideas')
    setTags('')
    setIsSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-dark-800 border border-dark-600 rounded-xl shadow-2xl w-full max-w-lg animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-600">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <h2 className="font-semibold text-lg">Quick Capture</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-dark-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Category Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Category
            </label>
            <div className="grid grid-cols-4 gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${
                    category === cat.value
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-dark-600 hover:border-dark-500'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full ${cat.color}`} />
                  <span className="text-xs">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's on your mind?"
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500 transition-colors"
              autoFocus
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Capture your thoughts, ideas, or research notes..."
              rows={5}
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500 transition-colors resize-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Tags (optional)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="trading, business, music, tech (comma separated)"
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2.5 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Auto Analyze Toggle */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoAnalyze"
                checked={autoAnalyze}
                onChange={(e) => setAutoAnalyze(e.target.checked)}
                className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-blue-500 focus:ring-blue-500"
              />
              <label htmlFor="autoAnalyze" className="text-sm text-gray-300">
                Auto-analyze (summarize & tag)
              </label>
            </div>
            <Sparkles className="w-4 h-4 text-purple-400" />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-dark-700 hover:bg-dark-600 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !content.trim() || isSubmitting}
              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-dark-600 disabled:text-gray-500 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Capture'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
