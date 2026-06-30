import { useState, useEffect } from 'react'
import {
  Loader2, Sparkles, Newspaper, TrendingUp, TrendingDown,
  CalendarDays, ListChecks, MessageSquare, Lightbulb, ExternalLink,
} from 'lucide-react'
import { Contact, MeetingNote, LifeEvent } from '../types'
import { Commitment } from '../lib/intelligence'
import { fetchCompanyHeadlines, CompanyHeadline } from '../lib/analytics'
import { getAiModel } from '../lib/ai'
import Modal from './Modal'
import { format, parseISO, differenceInDays } from 'date-fns'

interface Props {
  contact: Contact
  notes: MeetingNote[]
  events: LifeEvent[]
  commitments: Commitment[] // open only
  onClose: () => void
}

interface StockQuote {
  changePercent: number
  price: number
}

export default function BriefingModal({ contact, notes, events, commitments, onClose }: Props) {
  const [headlines, setHeadlines] = useState<CompanyHeadline[]>([])
  const [stock, setStock] = useState<StockQuote | null>(null)
  const [aiPoints, setAiPoints] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(true)

  const latestNote = notes[0] // already sorted newest-first by storage
  const upcoming = events
    .map((ev) => ({ ev, days: differenceInDays(nextOccurrence(ev.event_date, ev.recurring), new Date()) }))
    .filter(({ days }) => days >= 0 && days <= 30)
    .sort((a, b) => a.days - b.days)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const tasks: Promise<void>[] = []

      if (contact.company) {
        tasks.push(
          fetchCompanyHeadlines(contact.company)
            .then((h) => { if (!cancelled) setHeadlines(h.slice(0, 3)) })
            .catch(() => {})
        )
      }

      if (contact.ticker) {
        tasks.push(
          fetch(`/yfinance/v8/finance/chart/${contact.ticker.toUpperCase()}?interval=1d&range=2d`)
            .then((r) => r.json())
            .then((data) => {
              const meta = data.chart?.result?.[0]?.meta
              const prev = meta?.chartPreviousClose ?? meta?.previousClose
              const curr = meta?.regularMarketPrice
              if (prev && curr && !cancelled) {
                setStock({ changePercent: ((curr - prev) / prev) * 100, price: curr })
              }
            })
            .catch(() => {})
        )
      }

      await Promise.all(tasks)
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [contact.company, contact.ticker])

  // AI talking points — runs after free data lands, only if key is set
  useEffect(() => {
    if (loading) return
    const key = localStorage.getItem('apikey_anthropic')
    if (!key) return
    let cancelled = false

    const context = [
      `Contact: ${contact.first_name} ${contact.last_name}, ${contact.title ?? ''} at ${contact.company ?? 'unknown company'}`,
      contact.notes ? `Quick notes: ${contact.notes}` : '',
      latestNote ? `Last meeting (${latestNote.meeting_date}): ${latestNote.content.slice(0, 600)}` : '',
      commitments.length > 0 ? `Open promises I made: ${commitments.map((c) => c.text).join(' | ')}` : '',
      headlines.length > 0 ? `Recent company news: ${headlines.map((h) => h.title).join(' | ')}` : '',
      stock ? `Stock today: ${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(1)}%` : '',
      upcoming.length > 0 ? `Upcoming: ${upcoming.map(({ ev, days }) => `${ev.title} in ${days}d`).join(' | ')}` : '',
    ].filter(Boolean).join('\n')

    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': key,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: getAiModel(),
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `You're prepping an account manager for a meeting. Based on this context, write 4-6 short, specific talking points (one line each, no preamble, no numbering, one per line):\n\n${context}`,
        }],
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        const text: string = data.content?.[0]?.text ?? ''
        const points = text.split('\n').map((l: string) => l.replace(/^[-•*\d.)\s]+/, '').trim()).filter((l: string) => l.length > 5)
        if (!cancelled && points.length > 0) setAiPoints(points)
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Heuristic talking points — always available, replaced by AI when ready
  const freePoints: string[] = []
  for (const c of commitments.slice(0, 3)) freePoints.push(`Deliver on your promise: "${c.text}"`)
  if (stock) {
    const up = stock.changePercent >= 0
    freePoints.push(`${contact.ticker} is ${up ? 'up' : 'down'} ${Math.abs(stock.changePercent).toFixed(1)}% today — ${up ? 'acknowledge the momentum' : 'show awareness, ask how things feel internally'}`)
  }
  if (headlines[0]) freePoints.push(`Mention the news: "${headlines[0].title}"`)
  for (const { ev, days } of upcoming.slice(0, 2)) {
    freePoints.push(`${ev.title} is ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`} — acknowledge it`)
  }
  if (latestNote) {
    const firstLine = latestNote.content.split(/[.\n]/)[0].trim()
    if (firstLine) freePoints.push(`Pick up where you left off: "${firstLine}"`)
  }

  const points = aiPoints ?? freePoints

  return (
    <Modal title={`Briefing: ${contact.first_name} ${contact.last_name}`} onClose={onClose} size="lg">
      <div className="space-y-5">

        {/* Snapshot row */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {contact.tier && (
            <span className="badge bg-gray-100 text-gray-600 capitalize">{contact.tier} account</span>
          )}
          {contact.last_contacted && (
            <span className="badge bg-gray-100 text-gray-600">
              Last contact {format(parseISO(contact.last_contacted), 'MMM d')}
            </span>
          )}
          {stock && (
            <span className={`badge flex items-center gap-1 ${stock.changePercent >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              {stock.changePercent >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {contact.ticker} {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(1)}%
            </span>
          )}
        </div>

        {/* Talking points */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-2">
            <Lightbulb size={14} className="text-amber-500" /> Talking points
            {aiPoints && <span className="badge bg-brand-50 text-brand-600 flex items-center gap-0.5"><Sparkles size={9} /> AI</span>}
            {loading && <Loader2 size={12} className="animate-spin text-gray-300" />}
          </h3>
          {points.length === 0 ? (
            <p className="text-sm text-gray-400">Not enough data yet — log a meeting note or add company info.</p>
          ) : (
            <ul className="space-y-1.5">
              {points.map((p, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-brand-400 flex-shrink-0">→</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Open promises */}
        {commitments.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-2">
              <ListChecks size={14} className="text-brand-500" /> Open promises
            </h3>
            <ul className="space-y-1">
              {commitments.map((c) => (
                <li key={c.id} className={`text-sm px-3 py-1.5 rounded-lg ${c.stale ? 'bg-red-50/60 text-red-700' : 'bg-gray-50 text-gray-700'}`}>
                  {c.text}
                  <span className="text-xs text-gray-400 ml-2">({format(parseISO(c.note_date), 'MMM d')})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Last meeting */}
        {latestNote && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-2">
              <MessageSquare size={14} className="text-brand-500" /> Last meeting · {format(parseISO(latestNote.meeting_date), 'MMM d')}
            </h3>
            <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2.5 whitespace-pre-wrap line-clamp-6">
              {latestNote.content}
            </p>
          </div>
        )}

        {/* News */}
        {headlines.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-2">
              <Newspaper size={14} className="text-amber-500" /> {contact.company} in the news
            </h3>
            <ul className="space-y-1.5">
              {headlines.map((h, i) => (
                <li key={i}>
                  <a href={h.url} target="_blank" rel="noopener noreferrer" className="text-sm text-gray-700 hover:text-brand-600 flex items-start gap-1.5 group">
                    <ExternalLink size={12} className="mt-1 text-gray-300 group-hover:text-brand-400 flex-shrink-0" />
                    <span>{h.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-2">
              <CalendarDays size={14} className="text-violet-500" /> Coming up
            </h3>
            <ul className="space-y-1">
              {upcoming.map(({ ev, days }) => (
                <li key={ev.id} className="text-sm text-gray-700">
                  {ev.title} — <span className="text-gray-400">{days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

      </div>
    </Modal>
  )
}

/** Next occurrence of a date — recurring events roll forward to this year/next. */
function nextOccurrence(isoDate: string, recurring?: boolean): Date {
  const date = parseISO(isoDate)
  if (!recurring) return date
  const now = new Date()
  const candidate = new Date(now.getFullYear(), date.getMonth(), date.getDate())
  if (candidate < now) candidate.setFullYear(candidate.getFullYear() + 1)
  return candidate
}
