/**
 * Persistence layer.
 *
 * Durable user data (contacts, life events, meeting notes, reflections,
 * conferences, done-commitments) lives in Supabase, scoped to the logged-in
 * user via Row-Level Security. Alerts stay in localStorage — they're ephemeral
 * and regenerated from external APIs on each load.
 */
import { Contact, LifeEvent, MeetingNote, Alert, Reflection, Conference, Prospect } from '../types'
import { supabase } from './supabase'

let activeUserId: string | null = null

/** Set by AuthContext on login/logout. Used for insert ownership + alert namespacing. */
export function setActiveUser(id: string | null) {
  activeUserId = id
}

function uid(): string {
  if (!activeUserId) throw new Error('Not authenticated')
  return activeUserId
}

function now() {
  return new Date().toISOString()
}

/** Postgres date columns reject empty strings — turn '' into null. */
function nullEmptyDates<T extends Record<string, unknown>>(obj: T): T {
  const o = obj as Record<string, unknown>
  for (const f of ['birthday', 'last_contacted', 'event_date', 'meeting_date', 'date']) {
    if (o[f] === '') o[f] = null
  }
  return obj
}

/**
 * If Postgres rejects an unknown column (code 42703 — e.g. a schema migration
 * hasn't been run yet), drop that column from the payload so the rest still
 * saves. Returns a trimmed copy, or null if nothing could be stripped.
 */
function stripMissingColumn(
  payload: Record<string, unknown>,
  error: { code?: string; message?: string } | null
): Record<string, unknown> | null {
  if (!error || error.code !== '42703') return null
  const m = error.message?.match(/column \S*?\.?(\w+) does not exist/)
  const col = m?.[1]
  if (!col || !(col in payload)) return null
  const { [col]: _drop, ...rest } = payload
  return rest
}

// ── Contacts ──────────────────────────────────────────────────────────────────

export async function getContacts(): Promise<Contact[]> {
  const { data, error } = await supabase.from('contacts').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Contact[]
}

export async function getContact(id: string): Promise<Contact | undefined> {
  const { data, error } = await supabase.from('contacts').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data ?? undefined) as Contact | undefined
}

export async function createContact(data: Omit<Contact, 'id' | 'created_at' | 'updated_at'>): Promise<Contact> {
  let payload = nullEmptyDates({ ...data, user_id: uid() }) as Record<string, unknown>
  let { data: row, error } = await supabase.from('contacts').insert(payload).select().single()
  // Retry without any column the schema doesn't have yet (e.g. news_terms).
  for (let i = 0; i < 3 && error; i++) {
    const stripped = stripMissingColumn(payload, error)
    if (!stripped) break
    payload = stripped
    ;({ data: row, error } = await supabase.from('contacts').insert(payload).select().single())
  }
  if (error) throw error
  return row as Contact
}

export async function updateContact(id: string, data: Partial<Contact>): Promise<Contact> {
  const { id: _i, user_id: _u, created_at: _c, ...patch } = data as Record<string, unknown>
  let payload = nullEmptyDates({ ...patch, updated_at: now() }) as Record<string, unknown>
  let { data: row, error } = await supabase.from('contacts').update(payload).eq('id', id).select().single()
  for (let i = 0; i < 3 && error; i++) {
    const stripped = stripMissingColumn(payload, error)
    if (!stripped) break
    payload = stripped
    ;({ data: row, error } = await supabase.from('contacts').update(payload).eq('id', id).select().single())
  }
  if (error) throw error
  return row as Contact
}

export async function deleteContact(id: string): Promise<void> {
  // life_events and meeting_notes cascade-delete via FK
  const { error } = await supabase.from('contacts').delete().eq('id', id)
  if (error) throw error
}

// ── Life Events ───────────────────────────────────────────────────────────────

export async function getEvents(): Promise<LifeEvent[]> {
  const { data, error } = await supabase.from('life_events').select('*')
  if (error) throw error
  return (data ?? []) as LifeEvent[]
}

export async function getEventsForContact(contact_id: string): Promise<LifeEvent[]> {
  const { data, error } = await supabase.from('life_events').select('*').eq('contact_id', contact_id)
  if (error) throw error
  return (data ?? []) as LifeEvent[]
}

export async function createEvent(data: Omit<LifeEvent, 'id' | 'created_at'>): Promise<LifeEvent> {
  const { data: row, error } = await supabase
    .from('life_events')
    .insert({ ...data, user_id: uid() })
    .select()
    .single()
  if (error) throw error
  return row as LifeEvent
}

export async function updateEvent(id: string, data: Partial<LifeEvent>): Promise<LifeEvent> {
  const { id: _i, user_id: _u, created_at: _c, ...patch } = data as Record<string, unknown>
  const { data: row, error } = await supabase.from('life_events').update(patch).eq('id', id).select().single()
  if (error) throw error
  return row as LifeEvent
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('life_events').delete().eq('id', id)
  if (error) throw error
}

// ── Meeting Notes ─────────────────────────────────────────────────────────────

export async function getNotes(): Promise<MeetingNote[]> {
  const { data, error } = await supabase.from('meeting_notes').select('*')
  if (error) throw error
  return (data ?? []) as MeetingNote[]
}

export async function getNotesForContact(contact_id: string): Promise<MeetingNote[]> {
  const { data, error } = await supabase
    .from('meeting_notes')
    .select('*')
    .eq('contact_id', contact_id)
    .order('meeting_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as MeetingNote[]
}

export async function createNote(data: Omit<MeetingNote, 'id' | 'created_at' | 'updated_at'>): Promise<MeetingNote> {
  const { data: row, error } = await supabase
    .from('meeting_notes')
    .insert({ ...data, user_id: uid() })
    .select()
    .single()
  if (error) throw error
  return row as MeetingNote
}

export async function updateNote(id: string, data: Partial<MeetingNote>): Promise<MeetingNote> {
  const { id: _i, user_id: _u, created_at: _c, ...patch } = data as Record<string, unknown>
  const { data: row, error } = await supabase
    .from('meeting_notes')
    .update({ ...patch, updated_at: now() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return row as MeetingNote
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('meeting_notes').delete().eq('id', id)
  if (error) throw error
}

// ── Reflections (Playbook) ────────────────────────────────────────────────────

export async function getReflections(): Promise<Reflection[]> {
  const { data, error } = await supabase.from('reflections').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Reflection[]
}

export async function createReflection(data: Pick<Reflection, 'content' | 'category'>): Promise<Reflection> {
  const { data: row, error } = await supabase
    .from('reflections')
    .insert({ ...data, user_id: uid() })
    .select()
    .single()
  if (error) throw error
  return row as Reflection
}

export async function updateReflection(id: string, data: Partial<Reflection>): Promise<void> {
  const { id: _i, user_id: _u, created_at: _c, ...patch } = data as Record<string, unknown>
  const { error } = await supabase.from('reflections').update({ ...patch, updated_at: now() }).eq('id', id)
  if (error) throw error
}

export async function deleteReflection(id: string): Promise<void> {
  const { error } = await supabase.from('reflections').delete().eq('id', id)
  if (error) throw error
}

// ── Conferences ───────────────────────────────────────────────────────────────

export async function getConferences(): Promise<Conference[]> {
  const { data, error } = await supabase.from('conferences').select('*')
  if (error) throw error
  return (data ?? []) as Conference[]
}

export async function createConference(data: Omit<Conference, 'id' | 'created_at'>): Promise<Conference> {
  const { data: row, error } = await supabase
    .from('conferences')
    .insert({ ...data, user_id: uid() })
    .select()
    .single()
  if (error) throw error
  return row as Conference
}

export async function updateConference(id: string, data: Partial<Omit<Conference, 'id' | 'created_at'>>): Promise<void> {
  const { error } = await supabase.from('conferences').update(data).eq('id', id)
  if (error) throw error
}

export async function deleteConference(id: string): Promise<void> {
  const { error } = await supabase.from('conferences').delete().eq('id', id)
  if (error) throw error
}

// ── Prospects ─────────────────────────────────────────────────────────────────

export async function getProspects(): Promise<Prospect[]> {
  const { data, error } = await supabase.from('prospects').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Prospect[]
}

export async function createProspect(data: Omit<Prospect, 'id' | 'created_at' | 'updated_at'>): Promise<Prospect> {
  let payload = { ...data, user_id: uid() } as Record<string, unknown>
  let { data: row, error } = await supabase.from('prospects').insert(payload).select().single()
  for (let i = 0; i < 3 && error; i++) {
    const stripped = stripMissingColumn(payload, error)
    if (!stripped) break
    payload = stripped
    ;({ data: row, error } = await supabase.from('prospects').insert(payload).select().single())
  }
  if (error) throw error
  return row as Prospect
}

export async function updateProspect(id: string, data: Partial<Omit<Prospect, 'id' | 'created_at'>>): Promise<void> {
  let payload = { ...data, updated_at: now() } as Record<string, unknown>
  let { error } = await supabase.from('prospects').update(payload).eq('id', id)
  for (let i = 0; i < 3 && error; i++) {
    const stripped = stripMissingColumn(payload, error)
    if (!stripped) break
    payload = stripped
    ;({ error } = await supabase.from('prospects').update(payload).eq('id', id))
  }
  if (error) throw error
}

export async function deleteProspect(id: string): Promise<void> {
  const { error } = await supabase.from('prospects').delete().eq('id', id)
  if (error) throw error
}

// ── Done commitments (promise checkboxes) ─────────────────────────────────────

export async function getDoneCommitmentIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from('done_commitments').select('commitment_id')
  if (error) throw error
  return new Set((data ?? []).map((r) => r.commitment_id as string))
}

export async function toggleCommitmentDone(id: string): Promise<void> {
  const { data } = await supabase.from('done_commitments').select('commitment_id').eq('commitment_id', id).maybeSingle()
  if (data) {
    await supabase.from('done_commitments').delete().eq('commitment_id', id)
  } else {
    await supabase.from('done_commitments').insert({ commitment_id: id, user_id: uid() })
  }
}

// ── Alerts (ephemeral — localStorage, namespaced per user) ────────────────────

function alertsKey() {
  return `rma_${activeUserId ?? 'anon'}_alerts`
}

export function getAlerts(): Alert[] {
  try {
    return (JSON.parse(localStorage.getItem(alertsKey()) || '[]') as Alert[]).filter((a) => !a.dismissed)
  } catch {
    return []
  }
}

export function saveAlerts(freshAlerts: Alert[]) {
  let existing: Alert[] = []
  try { existing = JSON.parse(localStorage.getItem(alertsKey()) || '[]') as Alert[] } catch { /* ignore */ }
  const dismissed = existing.filter((a) => a.dismissed)
  const active = existing.filter((a) => !a.dismissed)
  const today = new Date().toISOString().slice(0, 10)

  // Ephemeral types re-evaluate each refresh — only keep if still in the fresh batch
  const ephemeral = new Set(['overdue_contact', 'birthday_soon', 'life_event_soon'])
  const freshByKey = new Map(freshAlerts.map((a) => [`${a.type}_${a.contact_id}`, a]))

  const kept = active.filter((a) => {
    if (ephemeral.has(a.type)) return freshByKey.has(`${a.type}_${a.contact_id}`)
    return a.created_at.slice(0, 10) !== today || !freshByKey.has(`${a.type}_${a.contact_id}`)
  })

  const keptKeys = new Set(kept.map((a) => `${a.type}_${a.contact_id}_${a.created_at.slice(0, 10)}`))
  const toAdd = freshAlerts.filter((a) => !keptKeys.has(`${a.type}_${a.contact_id}_${today}`))

  localStorage.setItem(alertsKey(), JSON.stringify([...dismissed, ...kept, ...toAdd]))
}

export function dismissAlert(id: string) {
  let alerts: Alert[] = []
  try { alerts = JSON.parse(localStorage.getItem(alertsKey()) || '[]') as Alert[] } catch { /* ignore */ }
  localStorage.setItem(alertsKey(), JSON.stringify(alerts.map((a) => (a.id === id ? { ...a, dismissed: true } : a))))
}
