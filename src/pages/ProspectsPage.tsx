import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Target, Plus, Search, Pencil, Trash2, ExternalLink, Linkedin,
  Building2, UserPlus, Loader2, TrendingUp,
} from 'lucide-react'
import { Prospect, ProspectStatus } from '../types'
import {
  getProspects, createProspect, updateProspect, deleteProspect, createContact,
} from '../lib/storage'
import Modal from '../components/Modal'

const STATUSES: { id: ProspectStatus; label: string; cls: string }[] = [
  { id: 'new', label: 'New', cls: 'bg-gray-100 text-gray-600' },
  { id: 'researching', label: 'Researching', cls: 'bg-amber-100 text-amber-700' },
  { id: 'reached_out', label: 'Reached out', cls: 'bg-emerald-100 text-emerald-700' },
]
const statusMeta = (s: ProspectStatus) => STATUSES.find((x) => x.id === s) ?? STATUSES[0]

export default function ProspectsPage() {
  const navigate = useNavigate()
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ProspectStatus | 'all'>('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Prospect | null>(null)
  const [convertingId, setConvertingId] = useState<string | null>(null)

  async function reload() {
    setLoadError(null)
    try {
      setProspects(await getProspects())
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load prospects.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { reload() }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return prospects
      .filter((p) => filter === 'all' || p.status === filter)
      .filter((p) => !q || [p.company, p.industry, p.contact_name, p.reason].some((v) => v?.toLowerCase().includes(q)))
  }, [prospects, query, filter])

  async function cycleStatus(p: Prospect) {
    const i = STATUSES.findIndex((s) => s.id === p.status)
    const next = STATUSES[(i + 1) % STATUSES.length].id
    setProspects((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: next } : x)))
    try { await updateProspect(p.id, { status: next }) } catch { reload() }
  }

  async function handleDelete(p: Prospect) {
    if (!confirm(`Remove ${p.company} from your prospects?`)) return
    await deleteProspect(p.id)
    reload()
  }

  async function convertToContact(p: Prospect) {
    setConvertingId(p.id)
    try {
      const [first, ...rest] = (p.contact_name ?? '').trim().split(/\s+/)
      await createContact({
        first_name: first || p.company,
        last_name: rest.join(' '),
        company: p.company,
        title: p.contact_title,
        linkedin_url: p.linkedin_url,
        ticker: p.ticker,
        news_terms: p.industry,
        notes: p.reason ? `Why engage: ${p.reason}` : undefined,
        tier: 'standard',
        tags: ['prospect'],
      })
      await deleteProspect(p.id)
      navigate('/contacts')
    } catch (e) {
      alert(`Could not convert: ${e instanceof Error ? e.message : 'unknown error'}`)
      setConvertingId(null)
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: prospects.length }
    for (const s of STATUSES) c[s.id] = prospects.filter((p) => p.status === s.id).length
    return c
  }, [prospects])

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="w-10 h-0.5 bg-gold-400 rounded-full mb-3" />
          <h1 className="text-3xl font-semibold text-gray-900 flex items-center gap-2.5">
            <Target size={24} className="text-brand-600" /> Prospects
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">
            Companies you want to engage but haven’t spoken to yet — your pipeline of accounts to open.
          </p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true) }} className="btn-primary flex items-center gap-1.5 flex-shrink-0">
          <Plus size={15} /> Add prospect
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-8"
            placeholder="Search company, industry, contact…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(['all', ...STATUSES.map((s) => s.id)] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full transition-colors ${filter === f ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {f === 'all' ? 'All' : statusMeta(f).label} {counts[f] ? `(${counts[f]})` : ''}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</p>
      ) : loadError ? (
        <div className="card text-sm text-red-600">
          Couldn’t load prospects: {loadError}
          <p className="text-xs text-gray-500 mt-2">
            If this mentions a missing <code className="bg-gray-100 px-1 rounded">prospects</code> table, run the prospects
            table SQL from <code className="bg-gray-100 px-1 rounded">supabase/schema.sql</code> in your Supabase SQL Editor.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Target size={30} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg">{prospects.length === 0 ? 'No prospects yet' : 'None match your filter'}</p>
          {prospects.length === 0 && <p className="text-sm mt-1">Add a company you’d like to break into.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const sm = statusMeta(p.status)
            return (
              <div key={p.id} className="card hover:shadow-lift transition-shadow">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
                    <Building2 size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900">{p.company}</p>
                      {p.ticker && <span className="badge bg-emerald-50 text-emerald-700 flex items-center gap-1"><TrendingUp size={10} />{p.ticker}</span>}
                      <button onClick={() => cycleStatus(p)} className={`badge ${sm.cls} hover:opacity-80`} title="Click to advance status">
                        {sm.label}
                      </button>
                    </div>
                    <div className="flex items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500 flex-wrap">
                      {p.industry && <span>{p.industry}</span>}
                      {p.contact_name && <span>· {p.contact_name}{p.contact_title ? `, ${p.contact_title}` : ''}</span>}
                      {p.website && (
                        <a href={p.website} target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:underline inline-flex items-center gap-0.5">
                          Website <ExternalLink size={10} />
                        </a>
                      )}
                      {p.linkedin_url && (
                        <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:underline inline-flex items-center gap-0.5">
                          <Linkedin size={11} /> LinkedIn
                        </a>
                      )}
                    </div>
                    {p.reason && <p className="text-sm text-gray-600 mt-2 leading-relaxed">{p.reason}</p>}
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => convertToContact(p)}
                      disabled={convertingId === p.id}
                      className="btn-ghost text-xs flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                      title="Move to Contacts"
                    >
                      {convertingId === p.id ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />} Convert
                    </button>
                    <div className="flex gap-1">
                      <button className="btn-ghost p-1.5" onClick={() => { setEditing(p); setShowForm(true) }} title="Edit"><Pencil size={13} /></button>
                      <button className="btn-ghost p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(p)} title="Delete"><Trash2 size={13} /></button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <ProspectForm
          prospect={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); reload() }}
        />
      )}
    </div>
  )
}

function ProspectForm({ prospect, onClose, onSaved }: { prospect: Prospect | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    company: prospect?.company ?? '',
    website: prospect?.website ?? '',
    industry: prospect?.industry ?? '',
    ticker: prospect?.ticker ?? '',
    contact_name: prospect?.contact_name ?? '',
    contact_title: prospect?.contact_title ?? '',
    linkedin_url: prospect?.linkedin_url ?? '',
    reason: prospect?.reason ?? '',
    status: prospect?.status ?? ('new' as ProspectStatus),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.company.trim()) return
    setSaving(true)
    setError(null)
    const data = {
      company: form.company.trim(),
      website: form.website.trim() || undefined,
      industry: form.industry.trim() || undefined,
      ticker: form.ticker.trim().toUpperCase() || undefined,
      contact_name: form.contact_name.trim() || undefined,
      contact_title: form.contact_title.trim() || undefined,
      linkedin_url: form.linkedin_url.trim() || undefined,
      reason: form.reason.trim() || undefined,
      status: form.status,
    }
    try {
      if (prospect) await updateProspect(prospect.id, data)
      else await createProspect(data)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. If it mentions a missing "prospects" table, run the schema SQL in Supabase.')
      setSaving(false)
    }
  }

  return (
    <Modal title={prospect ? 'Edit prospect' : 'Add prospect'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-gray-600">Company *</label>
          <input required autoFocus className="input mt-1" value={form.company} onChange={(e) => set('company', e.target.value)} placeholder="e.g. Acme Reinsurance" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Industry</label>
            <input className="input mt-1" value={form.industry} onChange={(e) => set('industry', e.target.value)} placeholder="Insurance" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Ticker</label>
            <input className="input mt-1" value={form.ticker} onChange={(e) => set('ticker', e.target.value)} placeholder="RGA" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Website</label>
          <input type="url" className="input mt-1" value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Key contact</label>
            <input className="input mt-1" value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} placeholder="Jane Doe" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Their title</label>
            <input className="input mt-1" value={form.contact_title} onChange={(e) => set('contact_title', e.target.value)} placeholder="VP Underwriting" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">LinkedIn URL</label>
          <input type="url" className="input mt-1" value={form.linkedin_url} onChange={(e) => set('linkedin_url', e.target.value)} placeholder="https://linkedin.com/in/…" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Why engage them</label>
          <textarea className="input mt-1 min-h-[70px] resize-y" value={form.reason} onChange={(e) => set('reason', e.target.value)} placeholder="The angle, a warm intro, a trigger event…" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Status</label>
          <select className="input mt-1" value={form.status} onChange={(e) => set('status', e.target.value)}>
            {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" disabled={saving || !form.company.trim()} className="btn-primary disabled:opacity-60">
            {saving ? 'Saving…' : prospect ? 'Save' : 'Add prospect'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
