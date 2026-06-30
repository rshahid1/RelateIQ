import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Sun, Mail, X, Copy, Check, ChevronRight } from 'lucide-react'
import { Contact, MeetingNote, Alert } from '../types'
import { buildAgenda, AgendaItem, AgendaReason } from '../lib/intelligence'
import { getDoneCommitmentIds } from '../lib/storage'
import { generateEmailDrafts, EmailDraft } from '../lib/emailDrafts'
import Avatar from '../components/Avatar'
import { format } from 'date-fns'

interface Props {
  contacts: Contact[]
  notes: MeetingNote[]
  alerts: Alert[]
}

const TONE_STYLE: Record<AgendaReason['tone'], string> = {
  red: 'bg-red-50 text-red-600',
  amber: 'bg-amber-50 text-amber-600',
  blue: 'bg-sky-50 text-sky-600',
  violet: 'bg-violet-50 text-violet-600',
  emerald: 'bg-emerald-50 text-emerald-600',
}

export default function TodayPage({ contacts, notes, alerts }: Props) {
  const [draftFor, setDraftFor] = useState<AgendaItem | null>(null)
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())

  useEffect(() => { getDoneCommitmentIds().then(setDoneIds) }, [notes])

  const agenda = useMemo(
    () => buildAgenda(contacts, notes, alerts, doneIds),
    [contacts, notes, alerts, doneIds]
  )

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Sun size={22} className="text-amber-400" /> Today
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {format(new Date(), 'EEEE, MMMM d')} — {agenda.length === 0 ? 'all caught up' : `${agenda.length} ${agenda.length === 1 ? 'person needs' : 'people need'} your attention`}
        </p>
      </div>

      {agenda.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">Nothing urgent today 🎉</p>
          <p className="text-sm mt-1">Every relationship is within its check-in window.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agenda.map((item, rank) => (
            <div key={item.contact.id} className="card flex items-start gap-3.5 hover:shadow-md transition-shadow">
              <span className="text-xs font-semibold text-gray-300 w-5 text-right mt-2.5 flex-shrink-0">
                {rank + 1}
              </span>
              <Link to={`/contacts/${item.contact.id}`} className="flex-shrink-0 mt-0.5">
                <Avatar name={`${item.contact.first_name} ${item.contact.last_name}`} url={item.contact.avatar_url} />
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={`/contacts/${item.contact.id}`} className="font-semibold text-gray-900 hover:text-brand-600 truncate block">
                  {item.contact.first_name} {item.contact.last_name}
                </Link>
                {(item.contact.title || item.contact.company) && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {[item.contact.title, item.contact.company].filter(Boolean).join(' · ')}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {item.reasons.slice(0, 4).map((r, i) => (
                    <span key={i} className={`badge ${TONE_STYLE[r.tone]}`}>{r.label}</span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <button
                  className="btn-ghost text-xs py-1.5 flex items-center gap-1.5"
                  onClick={() => setDraftFor(item)}
                >
                  <Mail size={12} /> Draft email
                </button>
                <Link
                  to={`/contacts/${item.contact.id}`}
                  className="btn-ghost text-xs py-1.5 flex items-center gap-1 justify-center text-gray-400"
                >
                  Open <ChevronRight size={12} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {draftFor && (
        <DraftEmailModal item={draftFor} alerts={alerts} onClose={() => setDraftFor(null)} />
      )}
    </div>
  )
}

// ── Draft email modal — reuses the per-alert draft generator ──────────────────

function DraftEmailModal({ item, alerts, onClose }: { item: AgendaItem; alerts: Alert[]; onClose: () => void }) {
  const [copied, setCopied] = useState<number | null>(null)

  // Use this contact's most interesting active alert; fall back to a check-in
  const drafts: EmailDraft[] = useMemo(() => {
    const contactAlerts = alerts.filter((a) => a.contact_id === item.contact.id && !a.dismissed)
    const order = ['birthday_soon', 'life_event_soon', 'earnings_soon', 'stock_move', 'holiday_soon', 'company_news', 'weather', 'overdue_contact']
    const best = contactAlerts.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))[0]
    const alert: Alert = best ?? {
      id: 'synthetic',
      contact_id: item.contact.id,
      contact_name: `${item.contact.first_name} ${item.contact.last_name}`,
      type: 'overdue_contact',
      title: 'Check-in',
      message: '',
      action_suggestion: '',
      created_at: new Date().toISOString(),
      dismissed: false,
    }
    return generateEmailDrafts(alert, item.contact)
  }, [item, alerts])

  function copy(draft: EmailDraft, i: number) {
    navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`)
    setCopied(i)
    setTimeout(() => setCopied(null), 1500)
  }

  function mailto(draft: EmailDraft): string {
    const to = item.contact.email ?? ''
    return `mailto:${to}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <p className="font-semibold text-gray-900">
            Email drafts for {item.contact.first_name}
          </p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {drafts.map((d, i) => (
            <div key={i} className="border border-gray-100 rounded-xl p-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="badge bg-brand-50 text-brand-600">{d.label}</span>
                <div className="flex gap-1">
                  <button className="btn-ghost p-1.5" title="Copy" onClick={() => copy(d, i)}>
                    {copied === i ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                  </button>
                  <a className="btn-ghost p-1.5" title="Open in email client" href={mailto(d)}>
                    <Mail size={13} />
                  </a>
                </div>
              </div>
              <p className="text-sm font-medium text-gray-900 mb-1">{d.subject}</p>
              <p className="text-xs text-gray-500 whitespace-pre-wrap line-clamp-4">{d.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
