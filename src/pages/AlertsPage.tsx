import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell, CloudRain, Newspaper, Linkedin, Music2, Cake, CalendarDays,
  Clock, RefreshCw, X, ChevronRight, Mail, Copy, Check, ChevronDown, ChevronUp,
  Gift, TrendingUp, TrendingDown, BarChart2, Sparkles, Loader2,
} from 'lucide-react'
import { Alert, AlertType } from '../types'
import { dismissAlert, getContact } from '../lib/storage'
import { generateEmailDrafts, EmailDraft } from '../lib/emailDrafts'
import { generateActivityDigest } from '../lib/analytics'
import { formatDistanceToNow, parseISO } from 'date-fns'

const ALERT_META: Record<AlertType, { icon: React.ElementType; color: string; bg: string }> = {
  weather:          { icon: CloudRain,     color: 'text-blue-600',    bg: 'bg-blue-50'    },
  company_news:     { icon: Newspaper,     color: 'text-amber-600',   bg: 'bg-amber-50'   },
  linkedin_change:  { icon: Linkedin,      color: 'text-indigo-600',  bg: 'bg-indigo-50'  },
  local_event:      { icon: Music2,        color: 'text-purple-600',  bg: 'bg-purple-50'  },
  birthday_soon:    { icon: Cake,          color: 'text-pink-600',    bg: 'bg-pink-50'    },
  life_event_soon:  { icon: CalendarDays,  color: 'text-brand-600',   bg: 'bg-brand-50'   },
  overdue_contact:  { icon: Clock,         color: 'text-orange-600',  bg: 'bg-orange-50'  },
  holiday_soon:     { icon: Gift,          color: 'text-violet-600',  bg: 'bg-violet-50'  },
  stock_move:       { icon: TrendingUp,    color: 'text-emerald-600', bg: 'bg-emerald-50' },
  earnings_soon:    { icon: BarChart2,     color: 'text-sky-600',     bg: 'bg-sky-50'     },
}

interface Props {
  alerts: Alert[]
  onRefresh: () => void
  loading?: boolean
}

export default function AlertsPage({ alerts, onRefresh, loading }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [digest, setDigest] = useState<string | null>(null)
  const [digesting, setDigesting] = useState(false)
  const [digestError, setDigestError] = useState<string | null>(null)

  function handleDismiss(id: string) {
    dismissAlert(id)
    setDismissed((prev) => new Set([...prev, id]))
  }

  const visible = alerts.filter((a) => !dismissed.has(a.id))

  async function handleDigest() {
    setDigestError(null)
    setDigest(null)
    setDigesting(true)
    try {
      const text = await generateActivityDigest(visible)
      setDigest(text || 'Nothing notable to brief on right now.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      setDigestError(
        msg === 'NO_KEY'
          ? 'Add your Anthropic API key in Settings to get an AI activity briefing.'
          : "Couldn't generate the briefing — try again."
      )
    }
    setDigesting(false)
  }
  const grouped: Record<string, Alert[]> = {}
  const order: AlertType[] = ['birthday_soon', 'holiday_soon', 'earnings_soon', 'stock_move', 'life_event_soon', 'weather', 'company_news', 'overdue_contact', 'linkedin_change', 'local_event']
  visible.forEach((a) => {
    if (!grouped[a.type]) grouped[a.type] = []
    grouped[a.type].push(a)
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {visible.length} active {visible.length === 1 ? 'alert' : 'alerts'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {visible.length > 0 && (
            <button
              className="btn-ghost flex items-center gap-1.5 border border-gray-200 disabled:opacity-50"
              onClick={handleDigest}
              disabled={digesting}
            >
              {digesting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="text-gold-500" />}
              AI briefing
            </button>
          )}
          <button className={`btn-ghost flex items-center gap-1.5 ${loading ? 'opacity-50' : ''}`} onClick={onRefresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {(digesting || digest || digestError) && (
        <div className="card mb-6 border-gold-200 bg-gold-100/20">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles size={15} className="text-gold-500" /> What's happening with your clients
            </h2>
            <button onClick={() => { setDigest(null); setDigestError(null) }} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>
          {digesting && (
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Reading the signals across your accounts…
            </p>
          )}
          {digestError && <p className="text-sm text-amber-700">{digestError}</p>}
          {digest && <div className="space-y-1">{renderDigest(digest)}</div>}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Bell size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg">You're all caught up!</p>
          <p className="text-sm mt-1">No active alerts right now. Check back later or hit Refresh.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {order.filter((type) => grouped[type]?.length).map((type) => {
            const meta = ALERT_META[type]
            const Icon = meta.icon
            return (
              <div key={type}>
                <div className={`flex items-center gap-2 mb-3 px-3 py-1.5 rounded-full w-fit ${meta.bg}`}>
                  <Icon size={13} className={meta.color} />
                  <span className={`text-xs font-semibold ${meta.color}`}>{labelForType(type)}</span>
                  <span className={`text-xs ${meta.color} opacity-70`}>({grouped[type].length})</span>
                </div>
                <div className="space-y-2">
                  {grouped[type].map((alert) => (
                    <AlertCard key={alert.id} alert={alert} meta={meta} onDismiss={() => handleDismiss(alert.id)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AlertCard({
  alert, meta, onDismiss,
}: {
  alert: Alert
  meta: { icon: React.ElementType; color: string; bg: string }
  onDismiss: () => void
}) {
  const stockUp = alert.type === 'stock_move' ? (alert.data?.change_percent as number ?? 0) >= 0 : null
  const Icon = alert.type === 'stock_move'
    ? (stockUp ? TrendingUp : TrendingDown)
    : meta.icon
  const iconColor = alert.type === 'stock_move'
    ? (stockUp ? 'text-emerald-600' : 'text-red-500')
    : meta.color
  const iconBg = alert.type === 'stock_move'
    ? (stockUp ? 'bg-emerald-50' : 'bg-red-50')
    : meta.bg

  const [showDrafts, setShowDrafts] = useState(false)
  const [drafts, setDrafts] = useState<EmailDraft[]>([])
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  async function handleDraftToggle() {
    if (!showDrafts && drafts.length === 0) {
      const contact = await getContact(alert.contact_id)
      if (contact) setDrafts(generateEmailDrafts(alert, contact))
    }
    setShowDrafts((v) => !v)
  }

  function copyDraft(draft: EmailDraft, idx: number) {
    const text = `Subject: ${draft.subject}\n\n${draft.body}`
    navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  return (
    <div className="card group">
      <div className="flex items-start gap-4">
        <div className={`rounded-xl p-2.5 flex-shrink-0 ${iconBg}`}>
          <Icon size={16} className={iconColor} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-sm text-gray-900">{alert.title}</p>
              <p className="text-sm text-gray-500 mt-0.5">{alert.message}</p>
            </div>
            <button
              className="text-gray-300 hover:text-gray-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 mt-0.5"
              onClick={onDismiss}
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-gray-400 italic">💡 {alert.action_suggestion}</p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-gray-400">
                {formatDistanceToNow(parseISO(alert.created_at), { addSuffix: true })}
              </span>
              <button
                onClick={handleDraftToggle}
                className="flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-700 transition-colors"
              >
                <Mail size={12} />
                Draft email
                {showDrafts ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              <Link
                to={`/contacts/${alert.contact_id}`}
                className="flex items-center gap-0.5 text-xs text-brand-500 hover:text-brand-700 font-medium"
              >
                View <ChevronRight size={12} />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Email drafts panel */}
      {showDrafts && drafts.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
          <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
            <Mail size={12} /> Email drafts — pick one, copy, and personalise
          </p>
          {drafts.map((draft, idx) => (
            <div key={idx} className="bg-gray-50 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-700">{draft.label}</span>
                <button
                  onClick={() => copyDraft(draft, idx)}
                  className="flex items-center gap-1 text-xs text-brand-500 hover:text-brand-700 transition-colors font-medium flex-shrink-0"
                >
                  {copiedIdx === idx ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy</>}
                </button>
              </div>
              <p className="text-xs text-gray-500 font-medium">Subject: {draft.subject}</p>
              <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{draft.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function renderDigest(text: string) {
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

function labelForType(type: AlertType): string {
  const labels: Record<AlertType, string> = {
    birthday_soon: 'Birthdays',
    holiday_soon: 'Holidays',
    earnings_soon: 'Earnings',
    stock_move: 'Stock Moves',
    life_event_soon: 'Life Events',
    weather: 'Weather Alerts',
    company_news: 'Company News',
    overdue_contact: 'Overdue Check-ins',
    linkedin_change: 'LinkedIn Updates',
    local_event: 'Local Events',
  }
  return labels[type]
}
