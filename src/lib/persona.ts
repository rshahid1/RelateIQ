/**
 * "Get to know them" — pulls a contact's richer LinkedIn profile (bio, education,
 * experience, skills) and has Claude synthesize a human picture of who they are:
 * likely interests/hobbies, what they value, and natural ways to build rapport.
 *
 * Note: the LinkedIn data API exposes profile fields (About, education, roles,
 * skills) — not someone's private likes/comments — so insights are grounded in
 * their public profile and any genuine guesses are flagged as inferred.
 */
import { Contact } from '../types'
import { getAiModel } from './ai'

function apiKey(name: string): string | null {
  return localStorage.getItem(`apikey_${name}`) || null
}

export interface LinkedInDossier {
  about?: string
  headline?: string
  skills: string[]
  education: string[]
  experience: string[]
  audience?: string
}

/** Fetch the rich LinkedIn fields via RapidAPI enrich-lead. Null if unavailable. */
export async function fetchLinkedInDossier(linkedinUrl: string): Promise<LinkedInDossier | null> {
  const key = apiKey('rapidapi')
  if (!key) return null
  try {
    const res = await fetch(
      `https://fresh-linkedin-profile-data.p.rapidapi.com/enrich-lead?linkedin_url=${encodeURIComponent(linkedinUrl)}&include_skills=true`,
      { headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': 'fresh-linkedin-profile-data.p.rapidapi.com' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    const p = data.data
    if (!p) return null

    const skills: string[] = Array.isArray(p.skills)
      ? p.skills.map((s: unknown) => (typeof s === 'string' ? s : (s as { name?: string })?.name)).filter(Boolean) as string[]
      : typeof p.skills === 'string' && p.skills
        ? p.skills.split(/[,\n]/).map((s: string) => s.trim()).filter(Boolean)
        : []

    const education: string[] = (Array.isArray(p.educations) ? p.educations : []).slice(0, 4).map((e: Record<string, string>) => {
      const head = [e.school, [e.degree, e.field_of_study].filter(Boolean).join(' ')].filter(Boolean).join(' — ')
      return e.activities ? `${head} (activities: ${e.activities})` : head
    }).filter(Boolean)

    const experience: string[] = (Array.isArray(p.experiences) ? p.experiences : []).slice(0, 5).map((x: Record<string, string>) => {
      const head = [x.title || x.job_title, x.company].filter(Boolean).join(' at ')
      return x.description ? `${head}: ${String(x.description).slice(0, 220)}` : head
    }).filter(Boolean)

    const audienceBits: string[] = []
    if (p.is_influencer) audienceBits.push('LinkedIn influencer')
    else if (p.is_creator) audienceBits.push('active LinkedIn creator')
    if (typeof p.follower_count === 'number' && p.follower_count > 2000) audienceBits.push(`${p.follower_count.toLocaleString()} followers`)

    return {
      about: typeof p.about === 'string' ? p.about : undefined,
      headline: typeof p.headline === 'string' ? p.headline : undefined,
      skills: skills.slice(0, 12),
      education,
      experience,
      audience: audienceBits.length ? audienceBits.join(', ') : undefined,
    }
  } catch {
    return null
  }
}

export interface WebMention {
  title: string
  source?: string
  url: string
}

/**
 * Broader web/news mentions of the person (beyond LinkedIn) — interviews, quotes,
 * press, speaking, causes. Uses the GDELT + Google News proxies (no extra key).
 * Best-effort and honest: many private individuals simply aren't written about.
 */
export async function fetchWebMentions(contact: Contact): Promise<WebMention[]> {
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim()
  if (!name) return []
  const company = contact.company?.trim()
  const phrase = company ? `"${name}" "${company}"` : `"${name}"`
  const last = contact.last_name?.toLowerCase()
  const seen = new Set<string>()
  const out: WebMention[] = []

  const add = (title?: string, url?: string, source?: string) => {
    if (!title || !url || !/^https?:\/\//i.test(url)) return
    const key = title.toLowerCase().slice(0, 60)
    if (seen.has(key)) return
    // Loose relevance: title should mention the person's last name.
    if (last && !title.toLowerCase().includes(last)) return
    seen.add(key)
    out.push({ title, url, source })
  }

  // GDELT — direct article URLs
  try {
    const res = await fetch(
      `/gdelt/doc/doc?query=${encodeURIComponent(`${phrase} sourcelang:eng`)}&mode=artlist&maxrecords=15&format=json&sort=datedesc`,
      { signal: AbortSignal.timeout(9000) }
    )
    if (res.ok) {
      const data = await res.json().catch(() => null)
      for (const a of data?.articles ?? []) add(a.title, a.url, a.domain)
    }
  } catch { /* ignore */ }

  // Google News RSS — broader coverage
  if (out.length < 6) {
    try {
      const res = await fetch(
        `/gnews/rss/search?q=${encodeURIComponent(phrase)}&hl=en-US&gl=US&ceid=US:en`,
        { signal: AbortSignal.timeout(9000) }
      )
      if (res.ok) {
        const doc = new DOMParser().parseFromString(await res.text(), 'text/xml')
        for (const item of Array.from(doc.querySelectorAll('item'))) {
          const rawUrl = item.querySelector('link')?.textContent?.trim() ?? ''
          const title = item.querySelector('title')?.textContent?.replace(/ - [^-]+$/, '').trim()
          const source = item.querySelector('source')?.textContent?.trim()
          add(title, /^https?:\/\//i.test(rawUrl) ? rawUrl : undefined, source)
        }
      }
    } catch { /* ignore */ }
  }

  return out.slice(0, 6)
}

/** Claude synthesizes a personal profile (markdown) from LinkedIn + web mentions. Needs Anthropic key. */
export async function generatePersona(
  contact: Contact,
  dossier: LinkedInDossier | null,
  web: WebMention[] = []
): Promise<string | null> {
  const key = apiKey('anthropic')
  if (!key) return null
  const who = [contact.first_name, contact.last_name].filter(Boolean).join(' ')
  const role = [contact.title, contact.company].filter(Boolean).join(' at ')

  const details = [
    dossier?.about && `About: ${dossier.about}`,
    dossier?.headline && `Headline: ${dossier.headline}`,
    dossier?.skills.length && `Skills: ${dossier.skills.join(', ')}`,
    dossier?.education.length && `Education: ${dossier.education.join(' | ')}`,
    dossier?.experience.length && `Experience: ${dossier.experience.join(' | ')}`,
    dossier?.audience && `Audience: ${dossier.audience}`,
    web.length && `Web & news mentions (what the wider internet says about them):\n${web.map((w) => `- ${w.title}${w.source ? ` (${w.source})` : ''}`).join('\n')}`,
  ].filter(Boolean).join('\n')

  if (!details.trim()) return null

  const prompt = `You help an account manager build genuine, human rapport with a client. Using ONLY the sources below for ${who}${role ? ` (${role})` : ''} — their LinkedIn profile plus wider web/news mentions — write a short profile of who they are as a person, the kind of insight that helps you connect authentically.

Use "## " headings and "- " bullets, exactly these four sections:

## Snapshot
(2-3 bullets: their background and what seems to define them)
## Likely interests & hobbies
(2-4 bullets drawn from their bio, education activities, and anything the web mentions suggest — add "(inferred)" to genuine guesses)
## What they seem to value
(1-2 bullets)
## How to connect
(2-3 specific, non-salesy conversation starters or rapport tips tied to real details — a recent talk, article, cause, or shared interest works well)

Be specific and human, never generic. Weave in public activity from the web mentions where relevant. Never invent facts; if a section has little to go on, keep it short.

Sources:
${details}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': key,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: getAiModel(),
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data?.content?.[0]?.text as string)?.trim() || null
  } catch {
    return null
  }
}

// ── localStorage cache (per contact) ─────────────────────────────────────────

export interface CachedPersona {
  text: string
  updatedAt: string
}

const CACHE_PREFIX = 'persona_'

export function getCachedPersona(contactId: string): CachedPersona | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE_PREFIX + contactId) || 'null')
  } catch {
    return null
  }
}

export function setCachedPersona(contactId: string, value: CachedPersona) {
  localStorage.setItem(CACHE_PREFIX + contactId, JSON.stringify(value))
}
