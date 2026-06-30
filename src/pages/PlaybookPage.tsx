import { useState, useMemo, useEffect } from 'react'
import { Lightbulb, Search, Trash2, Pencil, Check, X, Sparkles, Loader2 } from 'lucide-react'
import { Reflection, ReflectionCategory } from '../types'
import {
  getReflections, createReflection, updateReflection, deleteReflection,
} from '../lib/storage'
import { getAiModel } from '../lib/ai'
import { format, parseISO, isToday, isYesterday } from 'date-fns'

const CAT_META: Record<ReflectionCategory, { label: string; badge: string }> = {
  working: { label: "What's working", badge: 'bg-brand-50 text-brand-700' },
  improve: { label: 'To improve', badge: 'bg-amber-50 text-amber-700' },
  idea: { label: 'Idea', badge: 'bg-violet-50 text-violet-600' },
  note: { label: 'Note', badge: 'bg-gray-100 text-gray-600' },
}
const CAT_ORDER: ReflectionCategory[] = ['working', 'improve', 'idea', 'note']

function whenLabel(iso: string): string {
  const d = parseISO(iso)
  if (isToday(d)) return `Today · ${format(d, 'h:mm a')}`
  if (isYesterday(d)) return `Yesterday · ${format(d, 'h:mm a')}`
  return format(d, 'MMM d, yyyy')
}

export default function PlaybookPage() {
  const [reflections, setReflections] = useState<Reflection[]>([])
  const [draft, setDraft] = useState('')
  const [draftCat, setDraftCat] = useState<ReflectionCategory>('note')
  const [filter, setFilter] = useState<'all' | ReflectionCategory>('all')
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [synthesizing, setSynthesizing] = useState(false)
  const [synthesis, setSynthesis] = useState<string | null>(null)
  const [synthError, setSynthError] = useState<string | null>(null)

  async function reload() {
    setReflections(await getReflections())
  }

  useEffect(() => { reload() }, [])

  async function synthesize() {
    const key = localStorage.getItem('apikey_anthropic')
    if (!key) {
      setSynthesis(null)
      setSynthError('Add your Anthropic API key in Settings to unlock pattern synthesis.')
      return
    }
    setSynthError(null)
    setSynthesis(null)
    setSynthesizing(true)
    const corpus = reflections
      .map((r) => `[${CAT_META[r.category].label}] ${r.content}`)
      .join('\n')
    const prompt = `You are a sharp sales coach. Below are a salesperson's own reflections on their relationship-management and sales work, each tagged with a category. Identify the real patterns — don't just restate entries.\n\nRespond in exactly these three sections, using "## " for each heading and "- " for each bullet. Keep bullets short and specific to what they actually wrote:\n\n## What's consistently working\n## Recurring gaps\n## Do this next\n\nReflections:\n${corpus}`
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': key,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: getAiModel(),
          max_tokens: 700,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      const data = await res.json()
      const text: string = data.content?.[0]?.text ?? ''
      if (text) setSynthesis(text)
      else setSynthError('Could not generate a summary — try again.')
    } catch {
      setSynthError('Something went wrong reaching Claude. Check your key and connection.')
    }
    setSynthesizing(false)
  }

  async function save() {
    const text = draft.trim()
    if (!text) return
    await createReflection({ content: text, category: draftCat })
    setDraft('')
    setDraftCat('note')
    reload()
  }

  async function saveEdit(id: string) {
    const text = editText.trim()
    if (text) await updateReflection(id, { content: text })
    setEditingId(null)
    reload()
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return reflections.filter((r) => {
      const matchCat = filter === 'all' || r.category === filter
      const matchQ = !q || r.content.toLowerCase().includes(q)
      return matchCat && matchQ
    })
  }, [reflections, filter, query])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: reflections.length }
    for (const r of reflections) c[r.category] = (c[r.category] ?? 0) + 1
    return c
  }, [reflections])

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="w-10 h-0.5 bg-gold-400 rounded-full mb-3" />
          <h1 className="text-3xl font-semibold text-gray-900 flex items-center gap-2.5">
            <Lightbulb size={24} className="text-gold-500" /> Playbook
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">
            Your running log of wins, lessons, and ideas — capture thoughts as they come to sharpen your approach.
          </p>
        </div>
        {reflections.length >= 2 && (
          <button
            className="btn-ghost text-sm flex items-center gap-1.5 flex-shrink-0 mt-1 border border-gray-200 disabled:opacity-50"
            onClick={synthesize}
            disabled={synthesizing}
          >
            {synthesizing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="text-gold-500" />}
            Find patterns
          </button>
        )}
      </div>

      {/* Quick capture */}
      <div className="card mb-6">
        <textarea
          className="input min-h-[90px] resize-y border-0 focus:ring-0 p-0 text-[15px] leading-relaxed"
          placeholder="A win, a lesson, something you'd do differently next time…  (⌘/Ctrl + Enter to save)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save() }
          }}
        />
        <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-gray-100">
          <div className="flex flex-wrap gap-1.5">
            {CAT_ORDER.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setDraftCat(cat)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  draftCat === cat ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {CAT_META[cat].label}
              </button>
            ))}
          </div>
          <button className="btn-primary flex-shrink-0" onClick={save} disabled={!draft.trim()}>
            Save
          </button>
        </div>
      </div>

      {/* AI synthesis */}
      {(synthesizing || synthesis || synthError) && (
        <div className="card mb-6 border-gold-200 bg-gold-100/20">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles size={15} className="text-gold-500" /> Patterns in your playbook
            </h2>
            <button onClick={() => { setSynthesis(null); setSynthError(null) }} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>
          {synthesizing && (
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Reading your entries…
            </p>
          )}
          {synthError && <p className="text-sm text-amber-700">{synthError}</p>}
          {synthesis && <div className="space-y-1">{renderSynthesis(synthesis)}</div>}
        </div>
      )}

      {/* Filters */}
      {reflections.length > 0 && (
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex gap-1.5 flex-wrap">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="All" count={counts.all} />
            {CAT_ORDER.map((cat) => (
              <FilterChip
                key={cat}
                active={filter === cat}
                onClick={() => setFilter(cat)}
                label={CAT_META[cat].label}
                count={counts[cat] ?? 0}
              />
            ))}
          </div>
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-8"
              placeholder="Search your playbook…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Feed */}
      {reflections.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Lightbulb size={26} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">Nothing captured yet.</p>
          <p className="text-xs mt-1">Jot down your first thought above — what's working, or what you'd improve.</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center py-12 text-sm text-gray-400">No entries match.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className="card group">
              {editingId === r.id ? (
                <div>
                  <textarea
                    className="input min-h-[80px] resize-y text-[15px] leading-relaxed"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button className="btn-ghost text-xs flex items-center gap-1" onClick={() => setEditingId(null)}>
                      <X size={13} /> Cancel
                    </button>
                    <button className="btn-primary text-xs flex items-center gap-1" onClick={() => saveEdit(r.id)}>
                      <Check size={13} /> Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`badge ${CAT_META[r.category].badge}`}>{CAT_META[r.category].label}</span>
                      <span className="text-xs text-gray-400">{whenLabel(r.created_at)}</span>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="text-gray-300 hover:text-brand-600 transition-colors p-1"
                        onClick={() => { setEditingId(r.id); setEditText(r.content) }}
                        title="Edit"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className="text-gray-300 hover:text-red-400 transition-colors p-1"
                        onClick={async () => { if (confirm('Delete this entry?')) { await deleteReflection(r.id); reload() } }}
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <p className="text-[15px] text-gray-700 whitespace-pre-wrap leading-relaxed">{r.content}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function renderSynthesis(text: string) {
  return text.split('\n').map((line, i) => {
    const t = line.trim().replace(/\*\*/g, '')
    if (!t) return null
    if (t.startsWith('## ')) {
      return <h4 key={i} className="font-semibold text-gray-900 text-sm mt-3 first:mt-0">{t.slice(3)}</h4>
    }
    if (/^[-*•]\s/.test(t)) {
      return <li key={i} className="text-sm text-gray-700 ml-5 list-disc leading-relaxed">{t.replace(/^[-*•]\s/, '')}</li>
    }
    return <p key={i} className="text-sm text-gray-700 leading-relaxed">{t}</p>
  })
}

function FilterChip({ active, onClick, label, count }: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        active ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {label} <span className={active ? 'text-white/70' : 'text-gray-400'}>{count}</span>
    </button>
  )
}
