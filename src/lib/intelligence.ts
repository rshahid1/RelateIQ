/**
 * Relationship intelligence: health scoring, commitment extraction,
 * and daily agenda ranking. All heuristic — no API keys required.
 */
import { differenceInDays, parseISO } from 'date-fns'
import { Contact, MeetingNote, LifeEvent, Alert } from '../types'

// Same cadence windows as overdue alerts (analytics.ts)
const TIER_WINDOW: Record<NonNullable<Contact['tier']>, number> = {
  key: 14,
  standard: 30,
  low: 90,
}

// ── Health Score ──────────────────────────────────────────────────────────────
// NOTE: Currently dormant — not surfaced anywhere in the UI. The scoring heuristic
// needs more tuning before the numbers are trustworthy. Kept here to build on later.

export interface HealthFactor {
  label: string
  impact: 'good' | 'warn' | 'bad'
}

export interface HealthResult {
  score: number // 0–100
  band: 'healthy' | 'cooling' | 'at_risk'
  factors: HealthFactor[]
}

/** Latest touch = most recent of last_contacted and any meeting note date. */
function lastTouchDate(contact: Contact, notes: MeetingNote[]): string | null {
  const dates = notes.map((n) => n.meeting_date)
  if (contact.last_contacted) dates.push(contact.last_contacted)
  if (dates.length === 0) return null
  return dates.sort().reverse()[0]
}

export function healthScore(contact: Contact, notes: MeetingNote[]): HealthResult {
  const factors: HealthFactor[] = []
  const window = TIER_WINDOW[contact.tier ?? 'standard']
  const today = new Date()

  // Cadence (0–55): within tier window = full marks, decays to 0 at 3× window
  let cadence = 0
  const touch = lastTouchDate(contact, notes)
  if (!touch) {
    factors.push({ label: 'No recorded contact yet', impact: 'bad' })
  } else {
    const days = differenceInDays(today, parseISO(touch))
    if (days <= window) {
      cadence = 55
      factors.push({ label: `Last touch ${days}d ago — within ${window}d window`, impact: 'good' })
    } else {
      const past = days - window
      cadence = Math.max(0, Math.round(55 * (1 - past / (window * 2))))
      factors.push({ label: `${days}d since last touch — ${past}d past window`, impact: past > window ? 'bad' : 'warn' })
    }
  }

  // Momentum (0–25): meeting frequency over the last 2 windows vs the 2 before
  const periodDays = window * 2
  const recent = notes.filter((n) => differenceInDays(today, parseISO(n.meeting_date)) <= periodDays).length
  const prior = notes.filter((n) => {
    const d = differenceInDays(today, parseISO(n.meeting_date))
    return d > periodDays && d <= periodDays * 2
  }).length
  let momentum = 0
  if (recent >= 2) {
    momentum = 25
    factors.push({ label: `${recent} meetings in the last ${periodDays}d`, impact: 'good' })
  } else if (recent === 1) {
    momentum = 15
    factors.push({ label: `1 meeting in the last ${periodDays}d`, impact: 'good' })
  } else if (prior > 0) {
    momentum = 5
    factors.push({ label: 'Meeting frequency dropping off', impact: 'warn' })
  } else if (notes.length > 0) {
    factors.push({ label: 'No recent meetings logged', impact: 'warn' })
  }

  // Profile depth (0–20): richer data powers better intelligence
  let depth = 0
  if (contact.email) depth += 5
  if (notes.length > 0) depth += 5
  if (contact.birthday) depth += 5
  if (contact.last_contacted) depth += 5
  if (!contact.email) factors.push({ label: 'No email on file', impact: 'warn' })

  const score = Math.min(100, cadence + momentum + depth)
  const band = score >= 70 ? 'healthy' : score >= 40 ? 'cooling' : 'at_risk'
  return { score, band, factors }
}

// ── Commitment Tracker ────────────────────────────────────────────────────────

export interface Commitment {
  id: string
  contact_id: string
  note_id: string
  note_date: string // ISO date of the meeting the promise was made in
  text: string
  done: boolean
  stale: boolean // open and made more than 7 days ago
}

const COMMITMENT_PATTERNS = [
  /\b(?:i|we)(?:'ll| will)\s+(?:send|share|follow|get back|schedule|set up|put together|draft|circulate|intro|connect|review|prepare|forward|loop|check|confirm|call|email|reach)/i,
  /\b(?:action items?|next steps?|to-?dos?)\b\s*[:\-]/i,
  /\bneed to\s+(?:send|follow|schedule|share|confirm|review|prepare|get)/i,
  /\bpromised\b/i,
  /\bowe (?:them|him|her|you)\b/i,
  /\bby\s+(?:next week|monday|tuesday|wednesday|thursday|friday|eod|eow|end of (?:the )?(?:week|month|day))\b/i,
]

/** djb2 — stable id so done-state survives across sessions */
function hashId(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export function extractCommitments(notes: MeetingNote[], doneIds: Set<string>): Commitment[] {
  const out: Commitment[] = []
  const today = new Date()
  for (const note of notes) {
    const sentences = note.content
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.replace(/^[-•*\d.)\s]+/, '').trim())
      .filter((s) => s.length >= 8 && s.length <= 250)
    for (const sentence of sentences) {
      if (!COMMITMENT_PATTERNS.some((p) => p.test(sentence))) continue
      const id = hashId(`${note.id}|${sentence}`)
      const done = doneIds.has(id)
      out.push({
        id,
        contact_id: note.contact_id,
        note_id: note.id,
        note_date: note.meeting_date,
        text: sentence,
        done,
        stale: !done && differenceInDays(today, parseISO(note.meeting_date)) > 7,
      })
    }
  }
  // Newest first
  return out.sort((a, b) => b.note_date.localeCompare(a.note_date))
}

// ── Daily Agenda ──────────────────────────────────────────────────────────────

export interface AgendaReason {
  label: string
  tone: 'red' | 'amber' | 'blue' | 'violet' | 'emerald'
}

export interface AgendaItem {
  contact: Contact
  priority: number
  reasons: AgendaReason[]
  openCommitments: number
}

const ALERT_PRIORITY: Partial<Record<Alert['type'], { points: number; tone: AgendaReason['tone'] }>> = {
  birthday_soon: { points: 35, tone: 'violet' },
  life_event_soon: { points: 25, tone: 'violet' },
  weather: { points: 15, tone: 'blue' },
  earnings_soon: { points: 20, tone: 'blue' },
  stock_move: { points: 20, tone: 'emerald' },
  holiday_soon: { points: 15, tone: 'violet' },
  company_news: { points: 10, tone: 'blue' },
  linkedin_change: { points: 20, tone: 'blue' },
  local_event: { points: 10, tone: 'blue' },
}

export function buildAgenda(
  contacts: Contact[],
  notes: MeetingNote[],
  alerts: Alert[],
  doneIds: Set<string>
): AgendaItem[] {
  const today = new Date()
  const items: AgendaItem[] = []

  for (const contact of contacts) {
    const contactNotes = notes.filter((n) => n.contact_id === contact.id)
    const reasons: AgendaReason[] = []
    let priority = 0

    // Overdue per tier
    const window = TIER_WINDOW[contact.tier ?? 'standard']
    const touch = lastTouchDate(contact, contactNotes)
    if (touch) {
      const days = differenceInDays(today, parseISO(touch))
      if (days > window) {
        const past = days - window
        priority += 40 + Math.min(past, 30)
        reasons.push({ label: `${past}d past check-in window`, tone: 'red' })
      }
    } else {
      priority += 30
      reasons.push({ label: 'Never contacted', tone: 'red' })
    }

    // Open commitments
    const commitments = extractCommitments(contactNotes, doneIds).filter((c) => !c.done)
    const staleCount = commitments.filter((c) => c.stale).length
    if (commitments.length > 0) {
      priority += Math.min(commitments.length * 10, 30) + staleCount * 10
      reasons.push({
        label: `${commitments.length} open promise${commitments.length > 1 ? 's' : ''}${staleCount > 0 ? ` (${staleCount} stale)` : ''}`,
        tone: staleCount > 0 ? 'red' : 'amber',
      })
    }

    // Active alerts (one reason per type, points per alert capped at 2 each)
    const contactAlerts = alerts.filter((a) => a.contact_id === contact.id && !a.dismissed)
    const seenTypes = new Set<string>()
    for (const alert of contactAlerts) {
      const meta = ALERT_PRIORITY[alert.type]
      if (!meta || seenTypes.has(alert.type)) continue
      seenTypes.add(alert.type)
      priority += meta.points
      reasons.push({ label: alert.title, tone: meta.tone })
    }

    // Tier weighting — key accounts float up, low-touch sinks
    if (contact.tier === 'key') priority = Math.round(priority * 1.25)
    if (contact.tier === 'low') priority = Math.round(priority * 0.8)

    if (priority > 0) {
      items.push({ contact, priority, reasons, openCommitments: commitments.length })
    }
  }

  return items.sort((a, b) => b.priority - a.priority)
}
