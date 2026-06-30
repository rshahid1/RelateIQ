import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Building2, MapPin, Mail, Tag, Upload, X, Check, LayoutGrid, ChevronDown, ChevronRight } from 'lucide-react'
import { Contact, MeetingNote } from '../types'
import Avatar from '../components/Avatar'
import ContactForm from './ContactForm'
import { createContact, getNotes, getDoneCommitmentIds } from '../lib/storage'
import { parseCSVContacts, parseXLSXContacts, ImportedContact } from '../lib/importContacts'
import { extractCommitments } from '../lib/intelligence'
import { format, parseISO, differenceInDays } from 'date-fns'

interface Props {
  contacts: Contact[]
  onContactsChange: () => void
}

export default function ContactsPage({ contacts, onContactsChange }: Props) {
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [view, setView] = useState<'all' | 'account'>('all')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [importPreview, setImportPreview] = useState<Partial<ImportedContact>[] | null>(null)
  const [importSelected, setImportSelected] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const csvRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    const isXLSX = /\.(xlsx|xls)$/i.test(file.name)
    const reader = new FileReader()
    const finish = (parsed: Partial<ImportedContact>[]) => {
      setImportPreview(parsed)
      setImportSelected(new Set(parsed.map((_, i) => i)))
    }
    if (isXLSX) {
      reader.onload = (e) => finish(parseXLSXContacts(e.target?.result as ArrayBuffer))
      reader.readAsArrayBuffer(file)
    } else {
      reader.onload = (e) => finish(parseCSVContacts(e.target?.result as string))
      reader.readAsText(file)
    }
  }

  function toggleSelect(i: number) {
    setImportSelected((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  async function confirmImport() {
    if (!importPreview) return
    setImporting(true)
    for (let i = 0; i < importPreview.length; i++) {
      if (!importSelected.has(i)) continue
      const c = importPreview[i]
      if (!c.first_name && !c.last_name) continue
      await createContact({
        first_name: c.first_name ?? '',
        last_name: c.last_name ?? '',
        email: c.email,
        phone: c.phone,
        company: c.company,
        title: c.title,
        city: c.city,
        state: c.state,
        country: c.country,
        birthday: c.birthday,
        linkedin_url: c.linkedin_url,
        notes: c.notes,
        tags: [],
      })
    }
    onContactsChange()
    setImportPreview(null)
    setImportSelected(new Set())
    setImporting(false)
  }

  const allTags = useMemo(() => {
    const set = new Set<string>()
    contacts.forEach((c) => c.tags?.forEach((t) => set.add(t)))
    return Array.from(set).sort()
  }, [contacts])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return contacts.filter((c) => {
      const matchSearch =
        !q ||
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q)
      const matchTag = !tagFilter || c.tags?.includes(tagFilter)
      return matchSearch && matchTag
    })
  }, [contacts, search, tagFilter])

  const accountGroups = useMemo(() => {
    if (view !== 'account') return null
    const map = new Map<string, Contact[]>()
    for (const c of filtered) {
      const key = c.company?.trim() || ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(c)
    }
    const groups = [...map.entries()].map(([company, list]) => ({
      company,
      list: [...list].sort((a, b) =>
        `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
      ),
    }))
    // Named accounts first (by size, then name); "no company" bucket last
    groups.sort((a, b) => {
      if (a.company === '') return 1
      if (b.company === '') return -1
      if (b.list.length !== a.list.length) return b.list.length - a.list.length
      return a.company.localeCompare(b.company)
    })
    return groups
  }, [filtered, view])

  function toggleGroup(company: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(company) ? next.delete(company) : next.add(company)
      return next
    })
  }

  const [allNotes, setAllNotes] = useState<MeetingNote[]>([])
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (view !== 'account') return
    Promise.all([getNotes(), getDoneCommitmentIds()]).then(([ns, done]) => {
      setAllNotes(ns)
      setDoneIds(done)
    })
  }, [view, contacts])

  function accountRollup(list: Contact[]) {
    const keyCount = list.filter((c) => c.tier === 'key').length
    const ids = new Set(list.map((c) => c.id))
    const groupNotes = allNotes.filter((n) => ids.has(n.contact_id))
    const openPromises = extractCommitments(groupNotes, doneIds).filter((c) => !c.done).length
    let last: string | null = null
    for (const c of list) if (c.last_contacted && (!last || c.last_contacted > last)) last = c.last_contacted
    for (const n of groupNotes) if (!last || n.meeting_date > last) last = n.meeting_date
    const parts: string[] = []
    if (keyCount > 0) parts.push(`${keyCount} key`)
    if (last) {
      const d = differenceInDays(new Date(), parseISO(last))
      parts.push(`last touch ${d <= 0 ? 'today' : d < 30 ? `${d}d ago` : format(parseISO(last), 'MMM d')}`)
    }
    if (openPromises > 0) parts.push(`${openPromises} open promise${openPromises > 1 ? 's' : ''}`)
    return parts.join(' · ')
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-sm text-gray-500 mt-0.5">{contacts.length} people</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={csvRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" className="hidden" onChange={(e) => { if (e.target.files?.[0]) { handleFile(e.target.files[0]); e.target.value = '' } }} />
          <button className="btn-ghost flex items-center gap-1.5 text-sm" onClick={() => csvRef.current?.click()}>
            <Upload size={14} /> Import CSV
          </button>
          <button className="btn-primary flex items-center gap-1.5" onClick={() => setShowForm(true)}>
            <Plus size={15} /> Add Contact
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-8"
            placeholder="Search name, company, city…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {allTags.length > 0 && (
          <select
            className="input w-auto"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          >
            <option value="">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
          <button
            onClick={() => setView('all')}
            className={`px-2.5 py-2 transition-colors ${view === 'all' ? 'bg-brand-50 text-brand-600' : 'text-gray-400 hover:bg-gray-50'}`}
            title="All contacts"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            onClick={() => setView('account')}
            className={`px-2.5 py-2 transition-colors border-l border-gray-200 ${view === 'account' ? 'bg-brand-50 text-brand-600' : 'text-gray-400 hover:bg-gray-50'}`}
            title="Group by account"
          >
            <Building2 size={15} />
          </button>
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">No contacts found</p>
          <p className="text-sm mt-1">Try a different search or add a new contact.</p>
        </div>
      ) : accountGroups ? (
        <div className="space-y-6">
          {accountGroups.map((g) => {
            const isCollapsed = collapsed.has(g.company)
            return (
              <div key={g.company || '__none'}>
                <button
                  onClick={() => toggleGroup(g.company)}
                  className="flex items-center gap-2 w-full text-left mb-3 group"
                >
                  {isCollapsed ? <ChevronRight size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  <Building2 size={15} className="text-gray-400 flex-shrink-0" />
                  <span className="font-semibold text-gray-900">{g.company || 'No company'}</span>
                  <span className="badge bg-gray-100 text-gray-500">{g.list.length}</span>
                  {(() => {
                    const meta = accountRollup(g.list)
                    return meta ? <span className="text-xs text-gray-400 font-normal ml-1 hidden sm:inline">· {meta}</span> : null
                  })()}
                </button>
                {!isCollapsed && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {g.list.map((c) => (
                      <ContactCard key={c.id} contact={c} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <ContactCard key={c.id} contact={c} />
          ))}
        </div>
      )}

      {showForm && (
        <ContactForm
          onClose={() => setShowForm(false)}
          onSaved={() => { onContactsChange(); setShowForm(false) }}
        />
      )}

      {importPreview && (() => {
        const isDup = (c: Partial<ImportedContact>) =>
          contacts.some((ex) =>
            (c.email && ex.email && c.email.toLowerCase() === ex.email.toLowerCase()) ||
            (c.first_name && c.last_name &&
              ex.first_name.toLowerCase() === c.first_name.toLowerCase() &&
              ex.last_name.toLowerCase() === (c.last_name ?? '').toLowerCase())
          )
        const allChecked = importSelected.size === importPreview.length
        const selCount = importSelected.size
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between p-5 border-b border-gray-100">
                <div>
                  <p className="font-semibold text-gray-900">Import preview</p>
                  <p className="text-xs text-gray-500 mt-0.5">{selCount} of {importPreview.length} selected</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    className="text-xs text-brand-500 hover:underline"
                    onClick={() => setImportSelected(allChecked ? new Set() : new Set(importPreview.map((_, i) => i)))}
                  >
                    {allChecked ? 'Deselect all' : 'Select all'}
                  </button>
                  <button onClick={() => { setImportPreview(null); setImportSelected(new Set()) }} className="text-gray-400 hover:text-gray-600">
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto flex-1 p-4 space-y-2">
                {importPreview.map((c, i) => {
                  const dup = isDup(c)
                  const checked = importSelected.has(i)
                  return (
                    <div
                      key={i}
                      onClick={() => toggleSelect(i)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors ${checked ? 'bg-gray-50 hover:bg-gray-100' : 'bg-white opacity-50 hover:opacity-70'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(i)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded accent-brand-600 flex-shrink-0"
                      />
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${dup ? 'bg-amber-100 text-amber-700' : 'bg-brand-100 text-brand-700'}`}>
                        {(c.first_name?.[0] ?? '?').toUpperCase()}{(c.last_name?.[0] ?? '').toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}
                          {dup && <span className="ml-1.5 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">duplicate</span>}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {[c.title, c.company].filter(Boolean).join(' · ') || c.email || ''}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="p-4 border-t border-gray-100 flex gap-2">
                <button
                  onClick={confirmImport}
                  disabled={importing || selCount === 0}
                  className="btn-primary flex items-center gap-1.5 flex-1 justify-center disabled:opacity-40"
                >
                  <Upload size={14} />
                  Import {selCount} contact{selCount !== 1 ? 's' : ''}
                </button>
                <button onClick={() => { setImportPreview(null); setImportSelected(new Set()) }} className="btn-ghost">Cancel</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function ContactCard({ contact: c }: { contact: Contact }) {
  return (
    <Link to={`/contacts/${c.id}`} className="card hover:shadow-md transition-shadow block">
      <div className="flex items-start gap-3 mb-3">
        <Avatar name={`${c.first_name} ${c.last_name}`} url={c.avatar_url} />
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{c.first_name} {c.last_name}</p>
          {c.title && <p className="text-xs text-gray-500 truncate">{c.title}</p>}
        </div>
      </div>

      <div className="space-y-1.5 text-xs text-gray-500">
        {c.company && (
          <div className="flex items-center gap-1.5">
            <Building2 size={12} className="flex-shrink-0" />
            <span className="truncate">{c.company}</span>
          </div>
        )}
        {(c.city || c.state) && (
          <div className="flex items-center gap-1.5">
            <MapPin size={12} className="flex-shrink-0" />
            <span className="truncate">{[c.city, c.state].filter(Boolean).join(', ')}</span>
          </div>
        )}
        {c.email && (
          <div className="flex items-center gap-1.5">
            <Mail size={12} className="flex-shrink-0" />
            <span className="truncate">{c.email}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
        <div className="flex gap-1 flex-wrap">
          {c.tags?.slice(0, 2).map((t) => (
            <span key={t} className="badge bg-brand-50 text-brand-600 flex items-center gap-0.5">
              <Tag size={9} />{t}
            </span>
          ))}
        </div>
        {c.last_contacted && (
          <span className="text-xs text-gray-400">
            {format(parseISO(c.last_contacted), 'MMM d')}
          </span>
        )}
      </div>
    </Link>
  )
}
