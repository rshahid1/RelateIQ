/**
 * One-time migration of legacy localStorage data (the pre-cloud version) into
 * Supabase for the logged-in user. Runs in the user's own browser, where the
 * original `rma_local_*` data lives. Existing ids are preserved so contact
 * relationships (events/notes) stay intact; upserts ignore duplicates so it's
 * safe to run more than once.
 */
import { supabase } from './supabase'

const LEGACY = {
  contacts: 'rma_local_contacts',
  events: 'rma_local_events',
  notes: 'rma_local_notes',
  reflections: 'rma_local_reflections',
  conferences: 'rma_local_conferences',
}
const DONE_FLAG = 'rma_cloud_migrated_v1'

/* eslint-disable @typescript-eslint/no-explicit-any */

function readLegacy(key: string): any[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function dateOrNull(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

/** How many contacts are sitting in legacy local storage waiting to be imported. */
export function legacyContactCount(): number {
  return readLegacy(LEGACY.contacts).length
}

export function alreadyMigrated(): boolean {
  return localStorage.getItem(DONE_FLAG) === '1'
}

export interface MigrationResult {
  contacts: number
  events: number
  notes: number
  reflections: number
  conferences: number
}

export async function migrateLocalToCloud(userId: string): Promise<MigrationResult> {
  const contacts = readLegacy(LEGACY.contacts)
  const events = readLegacy(LEGACY.events)
  const notes = readLegacy(LEGACY.notes)
  const reflections = readLegacy(LEGACY.reflections)
  const conferences = readLegacy(LEGACY.conferences)

  const counts: MigrationResult = { contacts: 0, events: 0, notes: 0, reflections: 0, conferences: 0 }
  const contactIds = new Set(contacts.map((c) => c.id))

  if (contacts.length) {
    const rows = contacts.map((c) => ({
      id: c.id,
      user_id: userId,
      first_name: c.first_name ?? '',
      last_name: c.last_name ?? '',
      email: str(c.email),
      phone: str(c.phone),
      company: str(c.company),
      title: str(c.title),
      city: str(c.city),
      state: str(c.state),
      country: str(c.country),
      birthday: dateOrNull(c.birthday),
      linkedin_url: str(c.linkedin_url),
      avatar_url: str(c.avatar_url),
      tags: Array.isArray(c.tags) ? c.tags : [],
      notes: str(c.notes),
      last_contacted: dateOrNull(c.last_contacted),
      tier: c.tier === 'key' || c.tier === 'standard' || c.tier === 'low' ? c.tier : null,
      ticker: str(c.ticker),
      created_at: c.created_at || new Date().toISOString(),
      updated_at: c.updated_at || new Date().toISOString(),
    }))
    const { error } = await supabase.from('contacts').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw error
    counts.contacts = rows.length
  }

  const validEvents = events.filter((e) => contactIds.has(e.contact_id) && dateOrNull(e.event_date))
  if (validEvents.length) {
    const rows = validEvents.map((e) => ({
      id: e.id,
      user_id: userId,
      contact_id: e.contact_id,
      title: e.title ?? '',
      description: str(e.description),
      event_date: dateOrNull(e.event_date),
      recurring: !!e.recurring,
      category: e.category || 'other',
      notify_before_days: typeof e.notify_before_days === 'number' ? e.notify_before_days : null,
      created_at: e.created_at || new Date().toISOString(),
    }))
    const { error } = await supabase.from('life_events').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw error
    counts.events = rows.length
  }

  const validNotes = notes.filter((n) => contactIds.has(n.contact_id) && dateOrNull(n.meeting_date))
  if (validNotes.length) {
    const rows = validNotes.map((n) => ({
      id: n.id,
      user_id: userId,
      contact_id: n.contact_id,
      title: n.title ?? '',
      content: n.content ?? '',
      meeting_date: dateOrNull(n.meeting_date),
      created_at: n.created_at || new Date().toISOString(),
      updated_at: n.updated_at || new Date().toISOString(),
    }))
    const { error } = await supabase.from('meeting_notes').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw error
    counts.notes = rows.length
  }

  if (reflections.length) {
    const rows = reflections.map((r) => ({
      id: r.id,
      user_id: userId,
      content: r.content ?? '',
      category: r.category || 'note',
      created_at: r.created_at || new Date().toISOString(),
      updated_at: r.updated_at || new Date().toISOString(),
    }))
    const { error } = await supabase.from('reflections').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw error
    counts.reflections = rows.length
  }

  const validConfs = conferences.filter((cf) => dateOrNull(cf.date))
  if (validConfs.length) {
    const rows = validConfs.map((cf) => ({
      id: cf.id,
      user_id: userId,
      title: cf.title ?? '',
      date: dateOrNull(cf.date),
      location: str(cf.location),
      description: str(cf.description),
      url: str(cf.url),
      created_at: cf.created_at || new Date().toISOString(),
    }))
    const { error } = await supabase.from('conferences').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw error
    counts.conferences = rows.length
  }

  localStorage.setItem(DONE_FLAG, '1')
  return counts
}
