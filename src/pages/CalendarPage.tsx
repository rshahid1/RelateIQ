import { useMemo, useState, useEffect } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, parseISO, isToday, addMonths, subMonths } from 'date-fns'
import {
  ChevronLeft, ChevronRight, Cake, CalendarDays, Gift,
  Presentation, Sparkles, Search, Loader2, Trash2, Pencil, Plus, ExternalLink,
} from 'lucide-react'
import { Contact, LifeEvent, Conference } from '../types'
import { getConferences, createConference, updateConference, deleteConference } from '../lib/storage'
import { discoverConferences, ConferenceSuggestion } from '../lib/analytics'
import { searchCatalog } from '../lib/conferenceCatalog'
import Avatar from '../components/Avatar'
import Modal from '../components/Modal'
import { Link } from 'react-router-dom'

interface CalEvent {
  date: Date
  label: string
  type: 'birthday' | 'life_event' | 'holiday' | 'conference'
  contact?: Contact
  conference?: Conference
}

interface Props {
  contacts: Contact[]
  events: LifeEvent[]
}

function nextOccurrence(isoDate: string, year: number): Date {
  const d = parseISO(isoDate)
  return new Date(year, d.getMonth(), d.getDate())
}

export default function CalendarPage({ contacts, events }: Props) {
  const [current, setCurrent] = useState(new Date())
  const year = current.getFullYear()
  const month = current.getMonth()
  const [publicHolidays, setPublicHolidays] = useState<Array<{ date: string; name: string }>>([])
  const [conferences, setConferences] = useState<Conference[]>([])

  // Discovery panel state
  const [interest, setInterest] = useState('')
  const [finding, setFinding] = useState(false)
  const [suggestions, setSuggestions] = useState<ConferenceSuggestion[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [discoverError, setDiscoverError] = useState<string | null>(null)
  const [addedMsg, setAddedMsg] = useState<string | null>(null)

  // Manual add / edit form
  const [showForm, setShowForm] = useState(false)
  const [editConf, setEditConf] = useState<Conference | null>(null)

  async function reloadConferences() {
    setConferences(await getConferences())
  }

  useEffect(() => { reloadConferences() }, [])

  function openAdd() {
    setEditConf(null)
    setShowForm(true)
  }

  function openEdit(conf: Conference) {
    setEditConf(conf)
    setShowForm(true)
  }

  async function findConferences() {
    const q = interest.trim()
    if (!q) return
    setDiscoverError(null)
    setAddedMsg(null)
    setSuggestions(null)
    setFinding(true)

    const hasKey = !!localStorage.getItem('apikey_anthropic')
    let results: ConferenceSuggestion[] = []
    if (hasKey) {
      // AI path — broader/fresher; fall back to the free catalog on any failure
      try {
        results = await discoverConferences(q)
      } catch {
        results = searchCatalog(q)
      }
    } else {
      results = searchCatalog(q)
    }

    setSuggestions(results)
    setSelected(new Set(results.map((_, i) => i)))
    if (results.length === 0) {
      setDiscoverError('No matches in the built-in list — try a broader industry like "insurance", "tech", "finance", or "healthcare".')
    }
    setFinding(false)
  }

  async function addSelected() {
    if (!suggestions) return
    const picked = suggestions.filter((_, i) => selected.has(i))
    await Promise.all(picked.map((s) =>
      createConference({ title: s.title, date: s.date, location: s.location, description: s.description, url: s.url })
    ))
    await reloadConferences()
    setSuggestions(null)
    setSelected(new Set())
    setAddedMsg(`Added ${picked.length} to your calendar.`)
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  useEffect(() => {
    async function loadHolidays() {
      const ccs = [...new Set(contacts.map((c) => (c.country || 'US').toUpperCase().slice(0, 2)))]
      const all: Array<{ date: string; name: string }> = []
      for (const cc of ccs) {
        const cacheKey = `rma_local_holidays_${year}_${cc}`
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          all.push(...JSON.parse(cached))
          continue
        }
        try {
          const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${cc}`)
          if (res.ok) {
            const data = await res.json() as Array<{ date: string; name: string; localName: string }>
            const mapped = data.map((h) => ({ date: h.date, name: h.localName || h.name }))
            localStorage.setItem(cacheKey, JSON.stringify(mapped))
            all.push(...mapped)
          }
        } catch { /* skip */ }
      }
      setPublicHolidays(all)
    }
    loadHolidays()
  }, [contacts, year])

  const calEvents = useMemo<CalEvent[]>(() => {
    const result: CalEvent[] = []

    // Birthdays
    contacts.forEach((c) => {
      if (!c.birthday) return
      const d = nextOccurrence(c.birthday, year)
      if (d.getMonth() !== month) return
      result.push({ date: d, label: `🎂 ${c.first_name}'s birthday`, type: 'birthday', contact: c })
    })

    // Life events
    events.forEach((ev) => {
      const contact = contacts.find((c) => c.id === ev.contact_id)
      if (!contact) return
      const d = ev.recurring ? nextOccurrence(ev.event_date, year) : parseISO(ev.event_date)
      if (d.getMonth() !== month || d.getFullYear() !== year) return
      result.push({ date: d, label: ev.title, type: 'life_event', contact })
    })

    // Public holidays
    publicHolidays.forEach((h) => {
      const d = parseISO(h.date)
      if (d.getMonth() !== month || d.getFullYear() !== year) return
      result.push({ date: d, label: h.name, type: 'holiday' })
    })

    // Conferences
    conferences.forEach((conf) => {
      const d = parseISO(conf.date)
      if (d.getMonth() !== month || d.getFullYear() !== year) return
      result.push({ date: d, label: conf.title, type: 'conference', conference: conf })
    })

    return result.sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [contacts, events, publicHolidays, conferences, year, month])

  const days = eachDayOfInterval({ start: startOfMonth(current), end: endOfMonth(current) })
  const startPad = getDay(days[0])  // Sunday = 0

  const upcomingList = useMemo(() => {
    const today = new Date()
    const in90 = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
    const future: CalEvent[] = []

    contacts.forEach((c) => {
      if (!c.birthday) return
      const base = parseISO(c.birthday)
      let d = new Date(today.getFullYear(), base.getMonth(), base.getDate())
      if (d < today) d = new Date(today.getFullYear() + 1, base.getMonth(), base.getDate())
      if (d <= in90) future.push({ date: d, label: `${c.first_name}'s birthday`, type: 'birthday', contact: c })
    })

    events.forEach((ev) => {
      const contact = contacts.find((c) => c.id === ev.contact_id)
      if (!contact) return
      let d: Date
      if (ev.recurring) {
        const base = parseISO(ev.event_date)
        d = new Date(today.getFullYear(), base.getMonth(), base.getDate())
        if (d < today) d = new Date(today.getFullYear() + 1, base.getMonth(), base.getDate())
      } else {
        d = parseISO(ev.event_date)
      }
      if (d >= today && d <= in90) future.push({ date: d, label: ev.title, type: 'life_event', contact })
    })

    publicHolidays.forEach((h) => {
      const d = parseISO(h.date)
      if (d >= today && d <= in90) future.push({ date: d, label: h.name, type: 'holiday' })
    })

    conferences.forEach((conf) => {
      const d = parseISO(conf.date)
      if (d >= today && d <= in90) future.push({ date: d, label: conf.title, type: 'conference', conference: conf })
    })

    return future.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 15)
  }, [contacts, events, publicHolidays, conferences])

  async function handleDeleteConference(id: string) {
    await deleteConference(id)
    await reloadConferences()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Calendar</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar grid */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-5">
            <button className="btn-ghost p-2" onClick={() => setCurrent(subMonths(current, 1))}>
              <ChevronLeft size={16} />
            </button>
            <h2 className="font-semibold text-gray-900">{format(current, 'MMMM yyyy')}</h2>
            <button className="btn-ghost p-2" onClick={() => setCurrent(addMonths(current, 1))}>
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-2">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1">
            {Array.from({ length: startPad }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {days.map((day) => {
              const dayEvents = calEvents.filter((e) => isSameDay(e.date, day))
              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[52px] p-1 rounded-xl ${isToday(day) ? 'bg-brand-50 ring-2 ring-brand-200' : 'hover:bg-gray-50'}`}
                >
                  <p className={`text-xs font-medium text-center mb-1 ${isToday(day) ? 'text-brand-600' : 'text-gray-700'}`}>
                    {format(day, 'd')}
                  </p>
                  {dayEvents.slice(0, 2).map((ev, i) => {
                    const chip = (
                      <div key={i} className={`text-[10px] px-1 py-0.5 rounded truncate mb-0.5 leading-tight ${
                        ev.type === 'birthday' ? 'bg-pink-100 text-pink-700' :
                        ev.type === 'holiday' ? 'bg-violet-100 text-violet-700' :
                        ev.type === 'conference' ? 'bg-gold-100 text-gold-500' :
                        'bg-brand-100 text-brand-700'
                      }`}>
                        {ev.type === 'birthday' ? '🎂' : ev.type === 'holiday' ? '🏛' : ev.type === 'conference' ? '🎤' : '📌'} {ev.label}
                      </div>
                    )
                    if (ev.contact) return <Link key={i} to={`/contacts/${ev.contact.id}`}>{chip}</Link>
                    if (ev.type === 'conference' && ev.conference?.url) {
                      return <a key={i} href={ev.conference.url} target="_blank" rel="noopener noreferrer">{chip}</a>
                    }
                    return chip
                  })}
                  {dayEvents.length > 2 && (
                    <div className="text-[10px] text-gray-400 px-1">+{dayEvents.length - 2} more</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Discover conferences */}
          <div className="card">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Sparkles size={15} className="text-gold-500" /> Discover conferences
              </h3>
              <button onClick={openAdd} className="text-xs text-brand-500 hover:underline flex items-center gap-0.5 flex-shrink-0">
                <Plus size={12} /> Add manually
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Search well-known industry events and add them to your calendar — free. Add an Anthropic key in Settings for AI-powered discovery.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="input pl-8"
                  placeholder="e.g. reinsurance, insurtech"
                  value={interest}
                  onChange={(e) => setInterest(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') findConferences() }}
                />
              </div>
              <button className="btn-primary flex-shrink-0" onClick={findConferences} disabled={finding || !interest.trim()}>
                {finding ? <Loader2 size={14} className="animate-spin" /> : 'Find'}
              </button>
            </div>

            {discoverError && <p className="text-xs text-amber-700 mt-3">{discoverError}</p>}
            {addedMsg && <p className="text-xs text-brand-600 mt-3 flex items-center gap-1"><CalendarDays size={12} /> {addedMsg}</p>}

            {suggestions && suggestions.length > 0 && (
              <div className="mt-4">
                <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
                  {suggestions.map((s, i) => (
                    <label
                      key={i}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl cursor-pointer transition-colors ${selected.has(i) ? 'bg-gray-50 hover:bg-gray-100' : 'opacity-55 hover:opacity-80'}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(i)}
                        onChange={() => toggle(i)}
                        className="w-4 h-4 rounded accent-brand-600 mt-0.5 flex-shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 leading-snug">{s.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {format(parseISO(s.date), 'MMM d, yyyy')}{s.location ? ` · ${s.location}` : ''}
                        </p>
                        {s.description && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{s.description}</p>}
                        {s.url && (
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-brand-500 hover:underline mt-1 inline-flex items-center gap-1"
                          >
                            Learn more <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <p className="text-[11px] text-gray-400">Dates are estimates — verify before booking.</p>
                  <button className="btn-primary text-xs" onClick={addSelected} disabled={selected.size === 0}>
                    Add {selected.size}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Upcoming events list */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <CalendarDays size={15} className="text-brand-500" />
              Upcoming (90 days)
            </h3>
            {upcomingList.length === 0 ? (
              <p className="text-sm text-gray-400">No upcoming events.</p>
            ) : (
              <div className="space-y-3">
                {upcomingList.map((ev, i) => {
                  const inner = (
                    <>
                      {ev.type === 'holiday' ? (
                        <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                          <Gift size={13} className="text-violet-600" />
                        </div>
                      ) : ev.type === 'conference' ? (
                        <div className="w-7 h-7 rounded-full bg-gold-100 flex items-center justify-center flex-shrink-0">
                          <Presentation size={13} className="text-gold-500" />
                        </div>
                      ) : (
                        <Avatar name={`${ev.contact!.first_name} ${ev.contact!.last_name}`} size="sm" url={ev.contact!.avatar_url} />
                      )}
                      <div className="flex-1 min-w-0">
                        {ev.type === 'conference' && ev.conference?.url ? (
                          <a
                            href={ev.conference.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-gray-800 truncate hover:text-brand-600 inline-flex items-center gap-1"
                          >
                            {ev.label} <ExternalLink size={11} className="flex-shrink-0 text-gray-400" />
                          </a>
                        ) : (
                          <p className="text-sm font-medium text-gray-800 truncate">{ev.label}</p>
                        )}
                        <p className="text-xs text-gray-400 truncate">
                          {format(ev.date, 'MMM d, yyyy')}{ev.conference?.location ? ` · ${ev.conference.location}` : ''}
                        </p>
                      </div>
                      {ev.type === 'birthday' ? (
                        <Cake size={13} className="text-pink-400 flex-shrink-0" />
                      ) : ev.type === 'holiday' ? (
                        <Gift size={13} className="text-violet-400 flex-shrink-0" />
                      ) : ev.type === 'conference' ? (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => openEdit(ev.conference!)}
                            className="text-gray-300 hover:text-brand-600 transition-colors"
                            title="Edit conference"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteConference(ev.conference!.id)}
                            className="text-gray-300 hover:text-red-400 transition-colors"
                            title="Remove from calendar"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ) : (
                        <CalendarDays size={13} className="text-brand-400 flex-shrink-0" />
                      )}
                    </>
                  )
                  return ev.contact ? (
                    <Link key={i} to={`/contacts/${ev.contact.id}`} className="flex items-center gap-3 hover:bg-gray-50 -mx-2 px-2 py-1.5 rounded-xl transition-colors">
                      {inner}
                    </Link>
                  ) : (
                    <div key={i} className="flex items-center gap-3 -mx-2 px-2 py-1.5">
                      {inner}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {showForm && (
        <ConferenceForm
          initial={editConf}
          onClose={() => setShowForm(false)}
          onSaved={() => { reloadConferences(); setShowForm(false) }}
        />
      )}
    </div>
  )
}

// ── Manual add / edit form ────────────────────────────────────────────────────

function ConferenceForm({ initial, onClose, onSaved }: {
  initial: Conference | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [date, setDate] = useState(initial?.date ?? '')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !date) return
    const cleanUrl = url.trim()
    const data = {
      title: title.trim(),
      date,
      location: location.trim() || undefined,
      description: description.trim() || undefined,
      url: cleanUrl ? (/^https?:\/\//.test(cleanUrl) ? cleanUrl : `https://${cleanUrl}`) : undefined,
    }
    if (initial) await updateConference(initial.id, data)
    else await createConference(data)
    onSaved()
  }

  return (
    <Modal title={initial ? 'Edit conference' : 'Add conference'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Conference name *</label>
          <input required className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. InsureTech Connect" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date *</label>
            <input required type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Location</label>
            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Las Vegas, USA" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Website</label>
          <input type="url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
          <textarea className="input min-h-[70px] resize-y" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why it matters, who's attending…" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!title.trim() || !date}>
            {initial ? 'Save changes' : 'Add to calendar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
