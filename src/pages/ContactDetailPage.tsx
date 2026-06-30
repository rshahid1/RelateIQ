import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Mail, Phone, Linkedin, MapPin, Building2,
  Cake, Tag, Plus, Pencil, Trash2, CalendarDays, MessageSquare,
  Newspaper, ExternalLink, Loader2, Mic, MicOff, Sparkles,
  ListChecks, FileText,
} from 'lucide-react'
import {
  getContact, getEventsForContact, getNotesForContact,
  deleteContact, createEvent, deleteEvent, createNote, deleteNote, updateContact,
  getDoneCommitmentIds, toggleCommitmentDone,
} from '../lib/storage'
import { extractCommitments } from '../lib/intelligence'
import { getAiModel } from '../lib/ai'
import BriefingModal from '../components/BriefingModal'
import { Contact, LifeEvent, MeetingNote, EventCategory } from '../types'
import { fetchCompanyHeadlines, CompanyHeadline } from '../lib/analytics'
import Avatar from '../components/Avatar'
import Modal from '../components/Modal'
import ContactForm from './ContactForm'
import { format, parseISO } from 'date-fns'

const EVENT_ICONS: Record<EventCategory, string> = {
  birthday: '🎂', anniversary: '💍', baby: '👶', graduation: '🎓',
  promotion: '🚀', wedding: '💒', travel: '✈️', conference: '🎤', other: '📌',
}

export default function ContactDetailPage({ onContactsChange }: { onContactsChange: () => void }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [contact, setContact] = useState<Contact | null>(null)
  const [events, setEvents] = useState<LifeEvent[]>([])
  const [notes, setNotes] = useState<MeetingNote[]>([])
  const [showEditContact, setShowEditContact] = useState(false)
  const [showEventForm, setShowEventForm] = useState(false)
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false)
  const [showBriefing, setShowBriefing] = useState(false)
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  async function reload() {
    if (!id) return
    const [c, evs, ns, done] = await Promise.all([
      getContact(id), getEventsForContact(id), getNotesForContact(id), getDoneCommitmentIds(),
    ])
    setContact(c ?? null)
    setEvents(evs)
    setNotes(ns)
    setDoneIds(done)
    setLoading(false)
  }

  useEffect(() => { reload() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>
  if (!contact) return <div className="p-8 text-gray-400">Contact not found.</div>

  async function handleDelete() {
    if (!confirm(`Delete ${contact!.first_name} ${contact!.last_name}?`)) return
    await deleteContact(contact!.id)
    onContactsChange()
    navigate('/contacts')
  }

  async function markContacted() {
    if (!contact) return
    await updateContact(contact.id, { last_contacted: new Date().toISOString().slice(0, 10) })
    await reload()
    onContactsChange()
  }

  const fullName = `${contact.first_name} ${contact.last_name}`
  const commitments = extractCommitments(notes, doneIds)

  return (
    <div className="max-w-5xl">
      {/* Back */}
      <Link to="/contacts" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
        <ArrowLeft size={14} /> All Contacts
      </Link>

      <div className="flex gap-6 items-start">

      {/* Main column */}
      <div className="flex-1 min-w-0">

      {/* Header card */}
      <div className="card mb-5">
        <div className="flex items-start gap-4">
          <Avatar name={fullName} url={contact.avatar_url} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{fullName}</h1>
                {contact.title && <p className="text-sm text-gray-500">{contact.title}</p>}
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button className="btn-ghost p-2" onClick={() => setShowEditContact(true)} title="Edit">
                  <Pencil size={14} />
                </button>
                <button className="btn-ghost p-2 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={handleDelete} title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-sm text-gray-500">
              {contact.company && (
                <span className="flex items-center gap-1.5"><Building2 size={13} />{contact.company}</span>
              )}
              {(contact.city || contact.state) && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={13} />{[contact.city, contact.state].filter(Boolean).join(', ')}
                </span>
              )}
              {contact.birthday && (
                <span className="flex items-center gap-1.5">
                  <Cake size={13} />{format(parseISO(contact.birthday), 'MMMM d, yyyy')}
                </span>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 hover:text-brand-600">
                  <Mail size={13} />{contact.email}
                </a>
              )}
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 hover:text-brand-600">
                  <Phone size={13} />{contact.phone}
                </a>
              )}
              {contact.linkedin_url && (
                <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-brand-600">
                  <Linkedin size={13} />LinkedIn
                </a>
              )}
            </div>

            <div className="flex items-center justify-between mt-3">
              <div className="flex gap-1.5 flex-wrap">
                {contact.tags?.map((t) => (
                  <span key={t} className="badge bg-brand-50 text-brand-600">
                    <Tag size={9} />{t}
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost text-xs py-1.5 flex items-center gap-1.5" onClick={() => setShowBriefing(true)}>
                  <FileText size={13} /> Briefing
                </button>
                <button className="btn-primary text-xs py-1.5" onClick={markContacted}>
                  Mark as contacted today
                </button>
              </div>
            </div>
          </div>
        </div>

        {contact.notes && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-1">Quick notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{contact.notes}</p>
          </div>
        )}
      </div>

      {/* Life Events */}
      <div className="card mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <CalendarDays size={16} className="text-brand-500" /> Life Events
          </h2>
          <button className="btn-ghost text-xs flex items-center gap-1" onClick={() => setShowEventForm(true)}>
            <Plus size={13} /> Add event
          </button>
        </div>

        {events.length === 0 ? (
          <p className="text-sm text-gray-400">No events tracked. Add a birthday, graduation, or other milestone.</p>
        ) : (
          <div className="space-y-2">
            {events.map((ev) => (
              <div key={ev.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                <span className="text-xl leading-none mt-0.5">{EVENT_ICONS[ev.category]}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900">{ev.title}</p>
                  {ev.description && <p className="text-xs text-gray-500 mt-0.5">{ev.description}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    {format(parseISO(ev.event_date), 'MMMM d, yyyy')}
                    {ev.recurring && ' · repeats yearly'}
                    {ev.notify_before_days && ` · notify ${ev.notify_before_days}d before`}
                  </p>
                </div>
                <button
                  className="text-gray-300 hover:text-red-400 transition-colors"
                  onClick={async () => { await deleteEvent(ev.id); reload() }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Commitments — promises extracted from meeting notes */}
      {commitments.length > 0 && (
        <div className="card mb-5">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-1">
            <ListChecks size={16} className="text-brand-500" /> Promises
            {commitments.filter((c) => !c.done).length > 0 && (
              <span className="badge bg-amber-50 text-amber-600">
                {commitments.filter((c) => !c.done).length} open
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-400 mb-3">Commitments detected in your meeting notes — check them off as you deliver.</p>
          <div className="space-y-1.5">
            {commitments.map((c) => (
              <label
                key={c.id}
                className={`flex items-start gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-colors ${c.done ? 'opacity-50' : c.stale ? 'bg-red-50/60 hover:bg-red-50' : 'bg-gray-50 hover:bg-gray-100'}`}
              >
                <input
                  type="checkbox"
                  checked={c.done}
                  onChange={async () => { await toggleCommitmentDone(c.id); setDoneIds(await getDoneCommitmentIds()) }}
                  className="w-4 h-4 rounded accent-brand-600 mt-0.5 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm text-gray-700 ${c.done ? 'line-through' : ''}`}>{c.text}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    From note on {format(parseISO(c.note_date), 'MMM d')}
                    {c.stale && <span className="text-red-500 font-medium"> · going stale</span>}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Meeting Notes */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <MessageSquare size={16} className="text-brand-500" /> Meeting Notes
          </h2>
          <div className="flex items-center gap-2">
            <button
              className={`btn-ghost text-xs flex items-center gap-1 ${showVoiceRecorder ? 'text-red-500 hover:text-red-600' : ''}`}
              onClick={() => { setShowVoiceRecorder((v) => !v); setShowNoteForm(false) }}
              title="Record a voice note"
            >
              <Mic size={13} />
              {showVoiceRecorder ? 'Cancel' : 'Voice note'}
            </button>
            <button className="btn-ghost text-xs flex items-center gap-1" onClick={() => { setShowNoteForm(true); setShowVoiceRecorder(false) }}>
              <Plus size={13} /> Add note
            </button>
          </div>
        </div>

        {showVoiceRecorder && (
          <VoiceNoteRecorder
            contactId={contact.id}
            onSaved={() => { reload(); setShowVoiceRecorder(false) }}
            onClose={() => setShowVoiceRecorder(false)}
          />
        )}

        {notes.length === 0 ? (
          <p className="text-sm text-gray-400">No notes yet. Log key takeaways from your next meeting.</p>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => (
              <div key={note.id} className="border-l-2 border-brand-100 pl-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm text-gray-900">{note.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{format(parseISO(note.meeting_date), 'MMMM d, yyyy')}</p>
                  </div>
                  <button
                    className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                    onClick={async () => { await deleteNote(note.id); reload() }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{note.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showEditContact && (
        <ContactForm
          contact={contact}
          onClose={() => setShowEditContact(false)}
          onSaved={() => { reload(); onContactsChange(); setShowEditContact(false) }}
        />
      )}
      {showEventForm && (
        <EventForm
          contactId={contact.id}
          onClose={() => setShowEventForm(false)}
          onSaved={() => { reload(); setShowEventForm(false) }}
        />
      )}
      {showNoteForm && (
        <NoteForm
          contactId={contact.id}
          onClose={() => setShowNoteForm(false)}
          onSaved={() => { reload(); setShowNoteForm(false) }}
        />
      )}
      {showBriefing && (
        <BriefingModal
          contact={contact}
          notes={notes}
          events={events}
          commitments={commitments.filter((c) => !c.done)}
          onClose={() => setShowBriefing(false)}
        />
      )}

      </div>{/* end main column */}

      {/* Company news sidebar */}
      {contact.company && (
        <div className="w-72 flex-shrink-0 sticky top-6">
          <CompanyNewsSidebar company={contact.company} contactFirstName={contact.first_name} />
        </div>
      )}

      </div>{/* end flex row */}
    </div>
  )
}

// ── Voice Note Recorder ───────────────────────────────────────────────────────

function VoiceNoteRecorder({
  contactId, onSaved, onClose,
}: { contactId: string; onSaved: () => void; onClose: () => void }) {
  const [recState, setRecState] = useState<'recording' | 'processing' | 'reviewing'>('recording')
  const [liveTranscript, setLiveTranscript] = useState('')
  const [title, setTitle] = useState(`Voice note — ${format(new Date(), 'MMM d, yyyy')}`)
  const [editedSummary, setEditedSummary] = useState('')
  const recognitionRef = useRef<unknown>(null)
  const finalRef = useRef('')
  const activeRef = useRef(true)

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      alert('Voice recording requires Chrome or Edge.')
      onClose()
      return
    }
    finalRef.current = ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SR() as any
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    recognitionRef.current = rec

    rec.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalRef.current += e.results[i][0].transcript + ' '
        else interim += e.results[i][0].transcript
      }
      setLiveTranscript(finalRef.current + interim)
    }
    rec.onend = () => { if (activeRef.current) try { rec.start() } catch { /* ignore */ } }
    try { rec.start() } catch { /* ignore */ }

    return () => {
      activeRef.current = false
      try { rec.stop() } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function stopAndProcess() {
    activeRef.current = false
    try { (recognitionRef.current as any)?.stop() } catch { /* ignore */ }

    const raw = (finalRef.current.trim() || liveTranscript.trim())
    if (!raw) { onClose(); return }

    const key = localStorage.getItem('apikey_anthropic')
    if (!key) {
      setEditedSummary(raw)
      setRecState('reviewing')
      return
    }

    setRecState('processing')
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: getAiModel(),
          max_tokens: 400,
          messages: [{
            role: 'user',
            content: `Convert this voice memo from a meeting into 3-5 concise bullet points. Capture key discussion points, decisions, and action items. Be brief and practical.\n\nVoice memo: "${raw}"\n\nOutput only the bullet points, one per line, starting with •`,
          }],
        }),
      })
      const data = await res.json()
      setEditedSummary(data.content?.[0]?.text ?? raw)
    } catch {
      setEditedSummary(raw)
    }
    setRecState('reviewing')
  }

  async function save() {
    await createNote({
      contact_id: contactId,
      title,
      content: editedSummary,
      meeting_date: new Date().toISOString().slice(0, 10),
    })
    onSaved()
  }

  return (
    <div className="mb-4 bg-gray-50 rounded-2xl p-4 border border-gray-100">
      {recState === 'recording' && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <span className="text-sm font-medium text-gray-700">Recording</span>
            <span className="text-xs text-gray-400 ml-auto">Speak your post-meeting thoughts</span>
          </div>
          <div className="min-h-[72px] text-sm text-gray-600 leading-relaxed bg-white rounded-xl p-3 border border-gray-100">
            {liveTranscript || <span className="text-gray-300 italic">Listening…</span>}
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={stopAndProcess} className="btn-primary text-xs flex items-center gap-1.5">
              <MicOff size={12} /> Stop &amp; summarize
            </button>
            <button onClick={onClose} className="btn-ghost text-xs">Cancel</button>
          </div>
        </>
      )}

      {recState === 'processing' && (
        <div className="flex items-center gap-3 py-3 text-gray-500">
          <Loader2 size={15} className="animate-spin text-brand-500 flex-shrink-0" />
          <span className="text-sm">Summarizing with Claude…</span>
        </div>
      )}

      {recState === 'reviewing' && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={13} className="text-brand-500 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-700">Review before saving</span>
          </div>
          <div className="space-y-2 mb-3">
            <input
              className="input text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note title"
            />
            <textarea
              className="input text-sm min-h-[100px] resize-y leading-relaxed"
              value={editedSummary}
              onChange={(e) => setEditedSummary(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="btn-primary text-xs">Save note</button>
            <button onClick={onClose} className="btn-ghost text-xs">Discard</button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Company News Sidebar ──────────────────────────────────────────────────────

function formatNewsDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'MMM d, yyyy')
  } catch {
    return ''
  }
}

function CompanyNewsSidebar({ company, contactFirstName }: { company: string; contactFirstName: string }) {
  const [headlines, setHeadlines] = useState<CompanyHeadline[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchCompanyHeadlines(company).then((items) => {
      if (active) { setHeadlines(items); setLoading(false) }
    })
    return () => { active = false }
  }, [company])

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <div className="bg-amber-50 rounded-lg p-1.5">
          <Newspaper size={14} className="text-amber-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">{company}</p>
          <p className="text-xs text-gray-400">Latest news</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-gray-400">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-xs">Fetching news…</span>
        </div>
      ) : headlines.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">No recent news found for {company}.</p>
      ) : (
        <div className="space-y-3">
          {headlines.map((h, i) => (
            <a
              key={i}
              href={h.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block group"
            >
              <p className="text-xs text-gray-700 leading-snug group-hover:text-brand-600 transition-colors line-clamp-3">
                {h.title}
              </p>
              <div className="flex items-center gap-1 mt-1">
                {h.source && <span className="text-[10px] text-gray-400">{h.source}</span>}
                {h.published_at && (
                  <span className="text-[10px] text-gray-400">
                    · {formatNewsDate(h.published_at)}
                  </span>
                )}
                <ExternalLink size={9} className="text-gray-300 group-hover:text-brand-400" />
              </div>
            </a>
          ))}
        </div>
      )}

      <p className="text-[10px] text-gray-300 mt-4 pt-3 border-t border-gray-100">
        Great conversation starter for {contactFirstName}
      </p>
    </div>
  )
}

// ── Inline sub-forms ──────────────────────────────────────────────────────────

function EventForm({ contactId, onClose, onSaved }: { contactId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: '', description: '', event_date: '', category: 'other' as EventCategory,
    recurring: false, notify_before_days: 7,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await createEvent({ ...form, contact_id: contactId })
    onSaved()
  }

  return (
    <Modal title="Add Life Event" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Event title *</label>
          <input required className="input" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Baby due, Graduation, Work anniversary…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
            <select className="input" value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value as EventCategory }))}>
              {(Object.keys(EVENT_ICONS) as EventCategory[]).map((k) => (
                <option key={k} value={k}>{EVENT_ICONS[k]} {k}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date *</label>
            <input required type="date" className="input" value={form.event_date} onChange={(e) => setForm(f => ({ ...f, event_date: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
          <input className="input" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={form.recurring} onChange={(e) => setForm(f => ({ ...f, recurring: e.target.checked }))} className="rounded" />
            Repeat every year
          </label>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600">Notify</label>
            <input type="number" min={0} max={30} className="input w-16" value={form.notify_before_days} onChange={(e) => setForm(f => ({ ...f, notify_before_days: +e.target.value }))} />
            <span className="text-xs text-gray-500">days before</span>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary">Add event</button>
        </div>
      </form>
    </Modal>
  )
}

function NoteForm({ contactId, onClose, onSaved }: { contactId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: '', content: '', meeting_date: new Date().toISOString().slice(0, 10),
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await createNote({ ...form, contact_id: contactId })
    onSaved()
  }

  return (
    <Modal title="Add Meeting Note" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
          <input required className="input" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Q2 review, Coffee chat, Intro call…" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Meeting date</label>
          <input type="date" className="input" value={form.meeting_date} onChange={(e) => setForm(f => ({ ...f, meeting_date: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes *</label>
          <textarea
            required
            className="input min-h-[140px] resize-y"
            value={form.content}
            onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))}
            placeholder="Key takeaways, personal details mentioned, follow-ups…"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary">Save note</button>
        </div>
      </form>
    </Modal>
  )
}
