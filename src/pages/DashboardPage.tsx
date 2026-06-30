import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, Sun, ListChecks, Bell, ArrowRight, Cake, Gift,
  CalendarDays, MessageSquare, Sparkles, Lightbulb, Building2,
} from 'lucide-react'
import { Contact, MeetingNote, LifeEvent, Alert, ReflectionCategory, Reflection } from '../types'
import { buildAgenda, extractCommitments, AgendaReason } from '../lib/intelligence'
import { getDoneCommitmentIds, getReflections } from '../lib/storage'
import Avatar from '../components/Avatar'
import { format, parseISO, differenceInDays } from 'date-fns'

interface Props {
  contacts: Contact[]
  notes: MeetingNote[]
  events: LifeEvent[]
  alerts: Alert[]
}

const TONE_STYLE: Record<AgendaReason['tone'], string> = {
  red: 'bg-red-50 text-red-600',
  amber: 'bg-amber-50 text-amber-600',
  blue: 'bg-sky-50 text-sky-600',
  violet: 'bg-violet-50 text-violet-600',
  emerald: 'bg-emerald-50 text-emerald-600',
}

const REFLECTION_BADGE: Record<ReflectionCategory, { label: string; badge: string }> = {
  working: { label: "What's working", badge: 'bg-brand-50 text-brand-700' },
  improve: { label: 'To improve', badge: 'bg-amber-50 text-amber-700' },
  idea: { label: 'Idea', badge: 'bg-violet-50 text-violet-600' },
  note: { label: 'Note', badge: 'bg-gray-100 text-gray-600' },
}

interface Milestone {
  contactId: string
  name: string
  label: string
  days: number
  kind: 'birthday' | 'event'
}

export default function DashboardPage({ contacts, notes, events, alerts }: Props) {
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [latestReflection, setLatestReflection] = useState<Reflection | null>(null)

  useEffect(() => {
    getDoneCommitmentIds().then(setDoneIds)
    getReflections().then((rs) => setLatestReflection(rs[0] ?? null))
  }, [notes])

  const agenda = useMemo(
    () => buildAgenda(contacts, notes, alerts, doneIds),
    [contacts, notes, alerts, doneIds]
  )

  const openPromises = useMemo(
    () => extractCommitments(notes, doneIds).filter((c) => !c.done).length,
    [notes, doneIds]
  )

  const upcoming = useMemo<Milestone[]>(() => {
    const out: Milestone[] = []
    for (const c of contacts) {
      if (!c.birthday) continue
      const days = daysUntil(c.birthday, true)
      if (days >= 0 && days <= 30) {
        out.push({ contactId: c.id, name: `${c.first_name} ${c.last_name}`, label: 'Birthday', days, kind: 'birthday' })
      }
    }
    for (const ev of events) {
      const contact = contacts.find((c) => c.id === ev.contact_id)
      if (!contact) continue
      const days = daysUntil(ev.event_date, ev.recurring)
      if (days >= 0 && days <= 30) {
        out.push({ contactId: contact.id, name: `${contact.first_name} ${contact.last_name}`, label: ev.title, days, kind: 'event' })
      }
    }
    return out.sort((a, b) => a.days - b.days).slice(0, 5)
  }, [contacts, events])

  const recentNotes = useMemo(
    () => [...notes].sort((a, b) => b.meeting_date.localeCompare(a.meeting_date)).slice(0, 4),
    [notes]
  )

  const tierMix = useMemo(() => {
    const mix = { key: 0, standard: 0, low: 0 }
    for (const c of contacts) mix[c.tier ?? 'standard']++
    return mix
  }, [contacts])

  const topAccounts = useMemo(() => {
    const byCompany = new Map<string, { count: number; attention: number }>()
    for (const c of contacts) {
      const co = c.company?.trim()
      if (!co) continue
      if (!byCompany.has(co)) byCompany.set(co, { count: 0, attention: 0 })
      byCompany.get(co)!.count++
    }
    for (const item of agenda) {
      const co = item.contact.company?.trim()
      if (co && byCompany.has(co)) byCompany.get(co)!.attention++
    }
    return [...byCompany.entries()]
      .map(([company, v]) => ({ company, ...v }))
      .sort((a, b) => b.attention - a.attention || b.count - a.count)
      .slice(0, 5)
  }, [contacts, agenda])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const attention = agenda.length

  return (
    <div className="max-w-6xl">
      {/* Greeting */}
      <div className="mb-8">
        <div className="w-10 h-0.5 bg-gold-400 rounded-full mb-3" />
        <h1 className="text-3xl font-semibold text-gray-900">{greeting}</h1>
        <p className="text-sm text-gray-500 mt-1.5">
          {format(new Date(), 'EEEE, MMMM d')} —{' '}
          {attention === 0
            ? 'every relationship is on track today.'
            : `${attention} ${attention === 1 ? 'person needs' : 'people need'} your attention.`}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Users} tint="brand" value={contacts.length} label="Contacts" to="/contacts" />
        <StatCard icon={Sun} tint="amber" value={attention} label="Need attention" to="/today" />
        <StatCard icon={ListChecks} tint="violet" value={openPromises} label="Open promises" to="/notes" />
        <StatCard icon={Bell} tint="rose" value={alerts.length} label="Active alerts" to="/alerts" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's priorities */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Sun size={16} className="text-amber-400" /> Today's priorities
            </h2>
            <Link to="/today" className="text-xs text-brand-500 hover:underline flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>

          {agenda.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Sparkles size={22} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm">You're all caught up.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {agenda.slice(0, 5).map((item) => (
                <Link
                  key={item.contact.id}
                  to={`/contacts/${item.contact.id}`}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors group"
                >
                  <Avatar name={`${item.contact.first_name} ${item.contact.last_name}`} url={item.contact.avatar_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate group-hover:text-brand-600">
                      {item.contact.first_name} {item.contact.last_name}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.reasons.slice(0, 2).map((r, i) => (
                        <span key={i} className={`badge ${TONE_STYLE[r.tone]}`}>{r.label}</span>
                      ))}
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-gray-300 group-hover:text-brand-400 flex-shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right rail */}
        <div className="space-y-6">
          {/* Upcoming */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <CalendarDays size={16} className="text-violet-500" /> Upcoming
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-gray-400">No milestones in the next 30 days.</p>
            ) : (
              <div className="space-y-3">
                {upcoming.map((m, i) => (
                  <Link key={i} to={`/contacts/${m.contactId}`} className="flex items-center gap-2.5 group">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${m.kind === 'birthday' ? 'bg-pink-50 text-pink-500' : 'bg-violet-50 text-violet-500'}`}>
                      {m.kind === 'birthday' ? <Cake size={14} /> : <Gift size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate group-hover:text-brand-600">{m.name}</p>
                      <p className="text-xs text-gray-400 truncate">{m.label}</p>
                    </div>
                    <span className="text-xs font-medium text-gray-400 flex-shrink-0">
                      {m.days === 0 ? 'today' : m.days === 1 ? 'tomorrow' : `${m.days}d`}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recent notes */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <MessageSquare size={16} className="text-brand-500" /> Recent notes
              </h2>
              <Link to="/notes" className="text-xs text-brand-500 hover:underline">All</Link>
            </div>
            {recentNotes.length === 0 ? (
              <p className="text-sm text-gray-400">No meeting notes yet.</p>
            ) : (
              <div className="space-y-3">
                {recentNotes.map((note) => {
                  const c = contacts.find((x) => x.id === note.contact_id)
                  return (
                    <Link key={note.id} to={`/contacts/${note.contact_id}`} className="block group">
                      <p className="text-sm font-medium text-gray-900 truncate group-hover:text-brand-600">{note.title}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {c ? `${c.first_name} ${c.last_name}` : 'Unknown'} · {format(parseISO(note.meeting_date), 'MMM d')}
                      </p>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* From your Playbook */}
          {latestReflection && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Lightbulb size={16} className="text-gold-500" /> From your Playbook
                </h2>
                <Link to="/playbook" className="text-xs text-brand-500 hover:underline">Open</Link>
              </div>
              <span className={`badge ${REFLECTION_BADGE[latestReflection.category].badge}`}>
                {REFLECTION_BADGE[latestReflection.category].label}
              </span>
              <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap line-clamp-4">{latestReflection.content}</p>
              <p className="text-xs text-gray-400 mt-2">{format(parseISO(latestReflection.created_at), 'MMM d')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Top accounts */}
      {topAccounts.length > 0 && (
        <div className="card mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Building2 size={16} className="text-brand-500" /> Accounts
            </h2>
            <Link to="/contacts" className="text-xs text-brand-500 hover:underline">View all</Link>
          </div>
          <div className="space-y-1.5">
            {topAccounts.map((a) => (
              <Link
                key={a.company}
                to="/contacts"
                className="flex items-center gap-3 px-2 -mx-2 py-1.5 rounded-xl hover:bg-gray-50 transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
                  <Building2 size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate group-hover:text-brand-600">{a.company}</p>
                  <p className="text-xs text-gray-400">{a.count} {a.count === 1 ? 'contact' : 'contacts'}</p>
                </div>
                {a.attention > 0 && (
                  <span className="badge bg-amber-50 text-amber-700 flex-shrink-0">{a.attention} need attention</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Relationship mix */}
      {contacts.length > 0 && (
        <div className="card mt-6">
          <h2 className="font-semibold text-gray-900 mb-4">Relationship mix</h2>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100 mb-3 gap-px">
            <div className="bg-brand-600" style={{ width: `${pct(tierMix.key, contacts.length)}%` }} />
            <div className="bg-brand-300" style={{ width: `${pct(tierMix.standard, contacts.length)}%` }} />
            <div className="bg-gold-400" style={{ width: `${pct(tierMix.low, contacts.length)}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
            <Legend color="bg-brand-600" label="Key" count={tierMix.key} />
            <Legend color="bg-brand-300" label="Standard" count={tierMix.standard} />
            <Legend color="bg-gold-400" label="Low touch" count={tierMix.low} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const TINT: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-600',
  amber: 'bg-amber-50 text-amber-600',
  violet: 'bg-violet-50 text-violet-600',
  rose: 'bg-rose-50 text-rose-500',
}

function StatCard({ icon: Icon, tint, value, label, to }: {
  icon: typeof Users
  tint: keyof typeof TINT
  value: number
  label: string
  to: string
}) {
  return (
    <Link to={to} className="card hover:shadow-md transition-shadow flex items-center gap-3.5">
      <div className={`rounded-xl p-2.5 ${TINT[tint]}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-1">{label}</p>
      </div>
    </Link>
  )
}

function Legend({ color, label, count, style }: { color: string; label: string; count: number; style?: React.CSSProperties }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full ${color}`} style={style} />
      {label} <span className="font-semibold text-gray-700">{count}</span>
    </span>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysUntil(isoDate: string, recurring?: boolean): number {
  return differenceInDays(nextOccurrence(isoDate, recurring), new Date())
}

function nextOccurrence(isoDate: string, recurring?: boolean): Date {
  const date = parseISO(isoDate)
  if (!recurring) return date
  const now = new Date()
  const candidate = new Date(now.getFullYear(), date.getMonth(), date.getDate())
  if (differenceInDays(candidate, now) < 0) candidate.setFullYear(candidate.getFullYear() + 1)
  return candidate
}

function pct(n: number, total: number): number {
  return total === 0 ? 0 : (n / total) * 100
}
