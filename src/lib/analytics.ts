/**
 * Analytics integrations — weather, news, LinkedIn changes, local events.
 * Each function returns Alert objects to be surfaced in the notification feed.
 *
 * Keys are read from localStorage (set via the Settings page), falling back
 * to VITE_* env vars. Weather uses Open-Meteo and needs no key at all.
 */
import { Contact, Alert, AlertType } from '../types'
import { getAiModel } from './ai'
import { differenceInDays, parseISO, format } from 'date-fns'

function uuid() {
  return crypto.randomUUID()
}

/** fetch that aborts after `ms` so a stalled proxy can't hang the UI forever. */
async function fetchWithTimeout(url: string, ms = 8000, opts?: RequestInit): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

function apiKey(name: 'newsapi' | 'rapidapi'): string {
  return (
    localStorage.getItem(`apikey_${name}`) ||
    (name === 'newsapi'
      ? import.meta.env.VITE_NEWS_API_KEY
      : import.meta.env.VITE_RAPIDAPI_KEY) ||
    ''
  )
}

// ── Weather Alerts (Open-Meteo, no API key required) ──────────────────────────

interface GeoResult {
  latitude: number
  longitude: number
}

const geoCache = new Map<string, GeoResult | null>()

async function geocodeCity(city: string, state?: string, country?: string): Promise<GeoResult | null> {
  const cacheKey = [city, state, country].filter(Boolean).join(',').toLowerCase()
  if (geoCache.has(cacheKey)) return geoCache.get(cacheKey)!

  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=en`
    )
    if (!res.ok) { geoCache.set(cacheKey, null); return null }
    const data = await res.json()
    if (!data.results?.length) { geoCache.set(cacheKey, null); return null }

    // Prefer a result matching the state/admin area if provided
    const match = state
      ? data.results.find((r: { admin1?: string; admin1_code?: string }) =>
          r.admin1_code === state || r.admin1?.toLowerCase() === state.toLowerCase()
        ) ?? data.results[0]
      : data.results[0]

    const geo = { latitude: match.latitude, longitude: match.longitude }
    geoCache.set(cacheKey, geo)
    return geo
  } catch {
    geoCache.set(cacheKey, null)
    return null
  }
}

/** WMO weather codes considered severe enough to warrant a check-in. */
function severityLabel(code: number, tempF: number, windMph: number): string | null {
  if (code >= 95) return 'Thunderstorms'
  if (code === 65 || code === 67 || code === 82) return 'Heavy rain'
  if (code === 75 || code === 77 || code === 86) return 'Heavy snow'
  if (code >= 71 && code <= 73) return 'Snow'
  if (code === 66 || code === 56 || code === 57) return 'Freezing rain'
  if (code === 45 || code === 48) return null   // fog — not alert-worthy
  if (tempF >= 100) return 'Extreme heat'
  if (tempF <= 0) return 'Extreme cold'
  if (windMph >= 40) return 'High winds'
  return null
}

export async function fetchWeatherAlerts(contacts: Contact[]): Promise<Alert[]> {
  const alerts: Alert[] = []
  const citiesChecked = new Map<string, { label: string; detail: string } | null>()

  for (const contact of contacts) {
    if (!contact.city) continue
    const cityKey = [contact.city, contact.state].filter(Boolean).join(',').toLowerCase()

    if (!citiesChecked.has(cityKey)) {
      citiesChecked.set(cityKey, null)
      const geo = await geocodeCity(contact.city, contact.state, contact.country)
      if (geo) {
        try {
          const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}` +
            `&current=temperature_2m,weather_code,wind_speed_10m` +
            `&temperature_unit=fahrenheit&wind_speed_unit=mph`
          )
          if (res.ok) {
            const data = await res.json()
            const code = data.current?.weather_code ?? 0
            const temp = data.current?.temperature_2m ?? 70
            const wind = data.current?.wind_speed_10m ?? 0
            const label = severityLabel(code, temp, wind)
            if (label) {
              citiesChecked.set(cityKey, {
                label,
                detail: `${label} — ${Math.round(temp)}°F, wind ${Math.round(wind)} mph`,
              })
            }
          }
        } catch {
          // network failure — skip this city
        }
      }
    }

    const severe = citiesChecked.get(cityKey)
    if (!severe) continue

    alerts.push({
      id: uuid(),
      contact_id: contact.id,
      contact_name: `${contact.first_name} ${contact.last_name}`,
      type: 'weather' as AlertType,
      title: `${severe.label} in ${contact.city}`,
      message: severe.detail,
      action_suggestion: `Reach out to ${contact.first_name} to check in and see how they're doing.`,
      created_at: new Date().toISOString(),
      dismissed: false,
    })
  }
  return alerts
}

// ── Company News (NewsAPI if key set, otherwise GDELT — no key needed) ────────

interface Headline {
  title: string
  url: string
}

async function newsViaNewsApi(company: string, key: string): Promise<Headline | null> {
  const res = await fetch(
    `https://newsapi.org/v2/everything?q="${encodeURIComponent(company)}"&sortBy=publishedAt&pageSize=3&language=en&apiKey=${key}`
  )
  if (!res.ok) return null
  const data = await res.json()
  const article = data.articles?.[0]
  if (!article) return null
  if (differenceInDays(new Date(), new Date(article.publishedAt)) > 7) return null
  return { title: article.title, url: article.url }
}

async function newsViaGdelt(company: string): Promise<Headline | null> {
  // Proxied through the dev server (see vite.config.ts) — GDELT sends no CORS headers
  const res = await fetch(
    `/gdelt/doc/doc?query=${encodeURIComponent(`"${company}"`)}&mode=artlist&maxrecords=3&format=json&timespan=7d&sort=datedesc`
  )
  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  const article = data?.articles?.[0]
  if (!article?.title) return null
  return { title: article.title, url: article.url }
}

export async function fetchCompanyNews(contacts: Contact[]): Promise<Alert[]> {
  const key = apiKey('newsapi')
  const alerts: Alert[] = []
  const companiesChecked = new Set<string>()

  for (const contact of contacts) {
    if (!contact.company) continue
    const companyKey = contact.company.toLowerCase()
    if (companiesChecked.has(companyKey)) continue
    companiesChecked.add(companyKey)

    try {
      const headline = key
        ? await newsViaNewsApi(contact.company, key)
        : await newsViaGdelt(contact.company)
      if (!headline) continue

      const affectedContacts = contacts.filter(
        (c) => c.company?.toLowerCase() === companyKey
      )
      for (const c of affectedContacts) {
        alerts.push({
          id: uuid(),
          contact_id: c.id,
          contact_name: `${c.first_name} ${c.last_name}`,
          type: 'company_news' as AlertType,
          title: `News: ${contact.company}`,
          message: headline.title,
          action_suggestion: `${c.first_name}'s company is in the news — great conversation starter.`,
          created_at: new Date().toISOString(),
          dismissed: false,
          data: { url: headline.url },
        })
      }
    } catch {
      // silently skip
    }
  }
  return alerts
}

// ── Company Headlines (direct fetch for contact detail sidebar) ───────────────

export interface CompanyHeadline {
  title: string
  url: string
  source?: string
  published_at?: string
}

async function newsViaGoogleRss(company: string, extra = '', limit = 5): Promise<CompanyHeadline[]> {
  let res: Response
  try {
    res = await fetchWithTimeout(
      `/gnews/rss/search?q=${encodeURIComponent(`"${company}"${extra}`)}&hl=en-US&gl=US&ceid=US:en`
    )
  } catch {
    return []
  }
  if (!res.ok) return []
  const text = await res.text()
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  return Array.from(doc.querySelectorAll('item'))
    .slice(0, limit)
    .map((item) => {
      // The article URL is the <link> element's own text. Only accept absolute
      // URLs — anything else (e.g. a bare <guid> id) would break in-app navigation.
      const rawUrl = item.querySelector('link')?.textContent?.trim() ?? ''
      return {
        // Google RSS titles include " - Source Name" at the end — strip it
        title: item.querySelector('title')?.textContent?.replace(/ - [^-]+$/, '').trim() ?? '',
        url: /^https?:\/\//i.test(rawUrl) ? rawUrl : '',
        source: item.querySelector('source')?.textContent?.trim(),
        published_at: item.querySelector('pubDate')?.textContent?.trim() ?? undefined,
      }
    })
    .filter((h) => h.title && h.url)
}

export async function fetchCompanyHeadlines(company: string, terms?: string, limit = 5): Promise<CompanyHeadline[]> {
  const key = apiKey('newsapi')
  // Extra keyword(s) AND-ed into the search to disambiguate common names (e.g. "WCF" → "WCF" insurance)
  const extra = terms?.trim() ? ` ${terms.trim()}` : ''
  try {
    // NewsAPI if key configured
    if (key) {
      const res = await fetch(
        `https://newsapi.org/v2/everything?q=${encodeURIComponent(`"${company}"${extra}`)}&sortBy=publishedAt&pageSize=${limit}&language=en&apiKey=${key}`
      )
      if (res.ok) {
        const data = await res.json()
        const results = (data.articles ?? [])
          .filter((a: { publishedAt: string }) => differenceInDays(new Date(), new Date(a.publishedAt)) <= 90)
          .slice(0, limit)
          .map((a: { title: string; url: string; source?: { name: string } }) => ({
            title: a.title, url: a.url, source: a.source?.name,
          }))
        if (results.length > 0) return results
      }
    }
    // GDELT first — returns DIRECT article URLs, so headline links AND AI summaries
    // work (Google News uses obfuscated redirects that can't be fetched/summarized).
    // sourcelang:eng keeps results English/relevant.
    try {
      const res = await fetchWithTimeout(
        `/gdelt/doc/doc?query=${encodeURIComponent(`"${company}"${extra} sourcelang:eng`)}&mode=artlist&maxrecords=${Math.min(60, limit * 3)}&format=json&timespan=30d&sort=datedesc`
      )
      if (res.ok) {
        const data = await res.json().catch(() => null)
        const arts = (data?.articles ?? [])
          .map((a: { title: string; url: string; domain?: string; seendate?: string }) => ({
            title: a.title,
            url: a.url,
            source: a.domain,
            published_at: a.seendate ? gdeltDate(a.seendate) : undefined,
          }))
          .filter((h: CompanyHeadline) => h.title && /^https?:\/\//.test(h.url))
          .slice(0, limit)
        if (arts.length > 0) return arts
      }
    } catch { /* fall through to Google News */ }

    // Google News RSS fallback — broader coverage for smaller companies GDELT
    // misses. Noisier (and redirect links can't be AI-summarized), but the
    // relevance filter on the account/contact pages cleans it up.
    return await newsViaGoogleRss(company, extra, limit)
  } catch {
    return []
  }
}

/** GDELT seendate "20260705T120000Z" → ISO string. */
function gdeltDate(s: string): string | undefined {
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : undefined
}

/**
 * AI relevance filter — given a broad candidate pool of headlines, keep only the
 * ones genuinely about THIS company (using its industry + the contact's role to
 * disambiguate common names like "WCF"). No Anthropic key → returns unchanged.
 * On any failure, returns the input unchanged so news still shows.
 */
export async function filterRelevantHeadlines(
  headlines: CompanyHeadline[],
  ctx: { company: string; title?: string; hint?: string }
): Promise<CompanyHeadline[]> {
  const key = localStorage.getItem('apikey_anthropic')
  if (!key || headlines.length <= 2) return headlines

  const list = headlines.map((h, i) => `${i}. ${h.title}${h.source ? ` — ${h.source}` : ''}`).join('\n')
  const who = [ctx.hint && `industry/context: ${ctx.hint}`, ctx.title && `a contact there is a "${ctx.title}"`]
    .filter(Boolean)
    .join('; ')
  const prompt = `I'm an account manager tracking the company "${ctx.company}"${who ? ` (${who})` : ''}. Short company names are often ambiguous — e.g. "WCF" could be an insurer, a curling federation, or a software framework.

Step 1: infer this specific company's likely industry from the context above.
Step 2: from the numbered headlines below, keep ONLY the ones clearly about THIS organization in that industry. Be strict: if a headline is plausibly a different entity that shares the name/acronym, EXCLUDE it. Generic mentions that aren't about the company as an organization should also be excluded.

Respond with ONLY a JSON array of the kept numbers (e.g. [0,3,4]); use [] if none clearly match.

${list}`

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
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return headlines
    const data = await res.json()
    const text: string = data?.content?.[0]?.text ?? ''
    const start = text.indexOf('[')
    const end = text.lastIndexOf(']')
    if (start === -1 || end === -1) return headlines
    const idxs = JSON.parse(text.slice(start, end + 1))
    if (!Array.isArray(idxs)) return headlines
    const kept = idxs.map((n: number) => headlines[n]).filter(Boolean)
    return kept // respect the AI's picks (empty → genuinely nothing relevant)
  } catch {
    return headlines
  }
}

// ── LinkedIn Profile Lookup (single contact, for auto-fill) ──────────────────

export interface LinkedInProfile {
  first_name?: string
  last_name?: string
  title?: string
  headline?: string
  company?: string
  industry?: string
  city?: string
  state?: string
  country?: string
  email?: string
  phone?: string
  photo_url?: string
}

export async function fetchLinkedInProfile(linkedinUrl: string): Promise<LinkedInProfile | null> {
  const key = apiKey('rapidapi')
  if (!key) return null
  try {
    const res = await fetch(
      `https://fresh-linkedin-profile-data.p.rapidapi.com/enrich-lead?linkedin_url=${encodeURIComponent(linkedinUrl)}&include_skills=false`,
      { headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': 'fresh-linkedin-profile-data.p.rapidapi.com' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    const p = data.data
    if (!p) return null

    // Some responses return full_name only — split it
    let first = p.first_name as string | undefined
    let last = p.last_name as string | undefined
    if (!first && p.full_name) {
      const parts = (p.full_name as string).trim().split(/\s+/)
      first = parts[0]
      last = parts.slice(1).join(' ') || undefined
    }

    // Location may be "City, State, Country" or "City, Country"
    let city = p.city as string | undefined
    let country = p.country as string | undefined
    if (!city && p.location) {
      const parts = (p.location as string).split(',').map((s: string) => s.trim())
      city = parts[0]
      country = parts[parts.length - 1] || undefined
    }

    const email = (p.email ?? p.work_email ?? (Array.isArray(p.emails) ? p.emails[0] : undefined)) as string | undefined
    const phone = (p.phone ?? p.phone_number) as string | undefined

    return {
      first_name: first,
      last_name: last,
      title: (p.job_title ?? p.headline) as string | undefined,
      headline: p.headline as string | undefined,
      company: (p.company ?? p.company_name) as string | undefined,
      industry: (p.company_industry ?? p.industry) as string | undefined,
      city,
      state: p.state as string | undefined,
      country,
      email: typeof email === 'string' && email.includes('@') ? email : undefined,
      phone: typeof phone === 'string' && phone.trim() ? phone : undefined,
      photo_url: (p.profile_pic_url ?? p.photo_url ?? p.profile_image_url) as string | undefined,
    }
  } catch {
    return null
  }
}

// ── LinkedIn Job Changes (RapidAPI — Fresh LinkedIn Profile Data) ─────────────

export async function fetchLinkedInChanges(contacts: Contact[]): Promise<Alert[]> {
  const key = apiKey('rapidapi')
  if (!key) return []

  const alerts: Alert[] = []

  for (const contact of contacts) {
    if (!contact.linkedin_url) continue

    try {
      const res = await fetch(
        `https://fresh-linkedin-profile-data.p.rapidapi.com/get-linkedin-profile?linkedin_url=${encodeURIComponent(contact.linkedin_url)}&include_skills=false`,
        {
          headers: {
            'x-rapidapi-key': key,
            'x-rapidapi-host': 'fresh-linkedin-profile-data.p.rapidapi.com',
          },
        }
      )
      if (!res.ok) continue
      const data = await res.json()
      const profile = data.data
      if (!profile) continue

      const liCompany: string | undefined = profile.company
      const liTitle: string | undefined = profile.job_title

      // Compare against what we have on file — a mismatch suggests a job change
      const companyChanged =
        liCompany && contact.company &&
        liCompany.toLowerCase() !== contact.company.toLowerCase()
      const titleChanged =
        liTitle && contact.title &&
        liTitle.toLowerCase() !== contact.title.toLowerCase()

      if (companyChanged || titleChanged) {
        alerts.push({
          id: uuid(),
          contact_id: contact.id,
          contact_name: `${contact.first_name} ${contact.last_name}`,
          type: 'linkedin_change' as AlertType,
          title: `${contact.first_name} may have a new role`,
          message: companyChanged
            ? `LinkedIn shows ${liCompany} — you have ${contact.company} on file.`
            : `LinkedIn shows "${liTitle}" — you have "${contact.title}" on file.`,
          action_suggestion: `Congratulate ${contact.first_name} on the move, and update their record.`,
          created_at: new Date().toISOString(),
          dismissed: false,
          data: { linkedin_company: liCompany, linkedin_title: liTitle },
        })
      }
    } catch {
      // silently skip
    }
  }
  return alerts
}

// ── Local Events (RapidAPI — Real-Time Events Search) ─────────────────────────

export async function fetchLocalEvents(contacts: Contact[]): Promise<Alert[]> {
  const key = apiKey('rapidapi')
  if (!key) return []

  const alerts: Alert[] = []
  const citiesChecked = new Map<string, { name: string; date: string; venue: string } | null>()

  for (const contact of contacts) {
    if (!contact.city) continue
    const cityKey = contact.city.toLowerCase()

    if (!citiesChecked.has(cityKey)) {
      citiesChecked.set(cityKey, null)
      try {
        const res = await fetch(
          `https://real-time-events-search.p.rapidapi.com/search-events?query=${encodeURIComponent(`events in ${contact.city}`)}&date=week&is_virtual=false&start=0`,
          {
            headers: {
              'x-rapidapi-key': key,
              'x-rapidapi-host': 'real-time-events-search.p.rapidapi.com',
            },
          }
        )
        if (res.ok) {
          const data = await res.json()
          const event = data.data?.[0]
          if (event) {
            citiesChecked.set(cityKey, {
              name: event.name,
              date: event.start_time ? format(new Date(event.start_time), 'MMM d') : 'this week',
              venue: event.venue?.name ?? contact.city,
            })
          }
        }
      } catch {
        // silently skip
      }
    }

    const event = citiesChecked.get(cityKey)
    if (!event) continue

    alerts.push({
      id: uuid(),
      contact_id: contact.id,
      contact_name: `${contact.first_name} ${contact.last_name}`,
      type: 'local_event' as AlertType,
      title: `Happening in ${contact.city}: ${event.name}`,
      message: `${event.date} at ${event.venue}`,
      action_suggestion: `Conversation starter for ${contact.first_name} — or an excuse to visit.`,
      created_at: new Date().toISOString(),
      dismissed: false,
    })
  }
  return alerts
}

// ── Upcoming Birthdays & Life Events ──────────────────────────────────────────

export function generateUpcomingEventAlerts(
  contacts: Contact[],
  events: Array<{ id: string; contact_id: string; title: string; event_date: string; recurring?: boolean; category: string }>
): Alert[] {
  const alerts: Alert[] = []
  const today = new Date()

  // Birthdays from contact profiles
  for (const contact of contacts) {
    if (!contact.birthday) continue
    const next = nextOccurrence(contact.birthday)
    const days = differenceInDays(next, today)
    if (days >= 0 && days <= 14) {
      alerts.push({
        id: uuid(),
        contact_id: contact.id,
        contact_name: `${contact.first_name} ${contact.last_name}`,
        type: 'birthday_soon',
        title: `${contact.first_name}'s birthday ${days === 0 ? 'is today!' : `in ${days} day${days === 1 ? '' : 's'}`}`,
        message: `Birthday on ${format(next, 'MMMM d')}`,
        action_suggestion: `Send ${contact.first_name} a personal birthday message.`,
        created_at: new Date().toISOString(),
        dismissed: false,
      })
    }
  }

  // Life events
  for (const event of events) {
    const contact = contacts.find((c) => c.id === event.contact_id)
    if (!contact) continue
    const date = event.recurring ? nextOccurrence(event.event_date) : parseISO(event.event_date)
    const days = differenceInDays(date, today)
    if (days >= 0 && days <= 14) {
      alerts.push({
        id: uuid(),
        contact_id: contact.id,
        contact_name: `${contact.first_name} ${contact.last_name}`,
        type: 'life_event_soon',
        title: `${event.title} — ${days === 0 ? 'today!' : `in ${days} day${days === 1 ? '' : 's'}`}`,
        message: `${format(date, 'MMMM d')} — ${contact.first_name} ${contact.last_name}`,
        action_suggestion: `Reach out to ${contact.first_name} around this time.`,
        created_at: new Date().toISOString(),
        dismissed: false,
      })
    }
  }

  return alerts
}

// ── Overdue Contact Alerts (tier-aware cadence) ────────────────────────────────

const OVERDUE_DAYS: Record<string, number> = { key: 14, standard: 30, low: 90 }

export function generateOverdueAlerts(contacts: Contact[]): Alert[] {
  return contacts
    .filter((c) => {
      if (!c.last_contacted) return false
      const threshold = OVERDUE_DAYS[c.tier ?? 'standard']
      return differenceInDays(new Date(), parseISO(c.last_contacted)) > threshold
    })
    .map((c) => {
      const threshold = OVERDUE_DAYS[c.tier ?? 'standard']
      return {
        id: uuid(),
        contact_id: c.id,
        contact_name: `${c.first_name} ${c.last_name}`,
        type: 'overdue_contact' as AlertType,
        title: `Time to reconnect with ${c.first_name}`,
        message: `Last contact: ${format(parseISO(c.last_contacted!), 'MMMM d, yyyy')}`,
        action_suggestion: `It's been over ${threshold} days — a quick check-in would go a long way.`,
        created_at: new Date().toISOString(),
        dismissed: false,
      }
    })
}

// ── Holiday Alerts (Nager.Date — free, no key, CORS-enabled) ─────────────────

export async function fetchHolidayAlerts(contacts: Contact[]): Promise<Alert[]> {
  const alerts: Alert[] = []
  const checked = new Map<string, Array<{ date: string; name: string }>>()
  const today = new Date()
  const year = today.getFullYear()

  for (const contact of contacts) {
    const cc = (contact.country || 'US').toUpperCase().slice(0, 2)
    if (!checked.has(cc)) {
      try {
        const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${cc}`)
        checked.set(cc, res.ok ? (await res.json() as Array<{ date: string; name: string; localName: string }>)
          .map((h) => ({ date: h.date, name: h.localName || h.name })) : [])
      } catch {
        checked.set(cc, [])
      }
    }

    for (const holiday of checked.get(cc) ?? []) {
      const hDate = parseISO(holiday.date)
      const days = differenceInDays(hDate, today)
      if (days < 0 || days > 1) continue
      alerts.push({
        id: uuid(),
        contact_id: contact.id,
        contact_name: `${contact.first_name} ${contact.last_name}`,
        type: 'holiday_soon',
        title: `${holiday.name} — ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}`,
        message: `${holiday.name} on ${format(hDate, 'MMMM d')} — a warm seasonal message to ${contact.first_name} stands out.`,
        action_suggestion: `A holiday greeting to ${contact.first_name} is a personal touch that's hard to forget.`,
        created_at: new Date().toISOString(),
        dismissed: false,
        data: { holiday_name: holiday.name, date: holiday.date, days },
      })
    }
  }
  return alerts
}

// ── Stock Movement Alerts (Yahoo Finance via /yfinance proxy) ─────────────────

export async function fetchStockAlerts(contacts: Contact[]): Promise<Alert[]> {
  const alerts: Alert[] = []
  const checked = new Map<string, { changePercent: number; price: number } | null>()

  for (const contact of contacts) {
    if (!contact.ticker) continue
    const ticker = contact.ticker.toUpperCase()

    if (!checked.has(ticker)) {
      checked.set(ticker, null)
      try {
        const res = await fetch(`/yfinance/v8/finance/chart/${ticker}?interval=1d&range=2d`)
        if (res.ok) {
          const data = await res.json()
          const meta = data.chart?.result?.[0]?.meta
          const prev = meta?.chartPreviousClose ?? meta?.previousClose
          const curr = meta?.regularMarketPrice
          if (prev && curr) {
            const changePercent = ((curr - prev) / prev) * 100
            if (Math.abs(changePercent) >= 3) checked.set(ticker, { changePercent, price: curr })
          }
        }
      } catch { /* silently skip */ }
    }

    const quote = checked.get(ticker)
    if (!quote) continue

    const up = quote.changePercent > 0
    const pct = Math.abs(quote.changePercent).toFixed(1)
    alerts.push({
      id: uuid(),
      contact_id: contact.id,
      contact_name: `${contact.first_name} ${contact.last_name}`,
      type: 'stock_move',
      title: `${ticker} ${up ? '▲' : '▼'} ${pct}% today`,
      message: `${contact.company || ticker} is ${up ? 'up' : 'down'} ${pct}% — a natural opener with ${contact.first_name}.`,
      action_suggestion: up
        ? `Acknowledge the strong day and ask ${contact.first_name} how the momentum is feeling internally.`
        : `Check in with ${contact.first_name} — showing awareness of a tough day builds trust.`,
      created_at: new Date().toISOString(),
      dismissed: false,
      data: { ticker, change_percent: quote.changePercent, price: quote.price },
    })
  }
  return alerts
}

// ── Earnings Alerts (Yahoo Finance calendarEvents via /yfinance proxy) ────────

function earningsQuarter(date: Date): string {
  const m = date.getMonth() + 1
  if (m <= 3) return 'Q4'; if (m <= 6) return 'Q1'; if (m <= 9) return 'Q2'; return 'Q3'
}

export async function fetchEarningsAlerts(contacts: Contact[]): Promise<Alert[]> {
  const alerts: Alert[] = []
  const checked = new Map<string, string | null>()
  const today = new Date()

  for (const contact of contacts) {
    if (!contact.ticker) continue
    const ticker = contact.ticker.toUpperCase()

    if (!checked.has(ticker)) {
      checked.set(ticker, null)
      try {
        const res = await fetch(`/yfinance/v10/finance/quoteSummary/${ticker}?modules=calendarEvents`)
        if (res.ok) {
          const data = await res.json()
          const earningsDates = data.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate
          if (earningsDates?.length) {
            const ts = earningsDates[0].raw as number
            checked.set(ticker, new Date(ts * 1000).toISOString().slice(0, 10))
          }
        }
      } catch { /* silently skip */ }
    }

    const earningsDate = checked.get(ticker)
    if (!earningsDate) continue
    const eDate = parseISO(earningsDate)
    const days = differenceInDays(eDate, today)
    if (days < 0 || days > 14) continue

    alerts.push({
      id: uuid(),
      contact_id: contact.id,
      contact_name: `${contact.first_name} ${contact.last_name}`,
      type: 'earnings_soon',
      title: `${ticker} ${earningsQuarter(eDate)} earnings ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}`,
      message: `${contact.company || ticker} reports on ${format(eDate, 'MMMM d')} — perfect timing to connect with ${contact.first_name}.`,
      action_suggestion: `Reach out before earnings to show you're following the business, and again after results drop.`,
      created_at: new Date().toISOString(),
      dismissed: false,
      data: { ticker, earnings_date: earningsDate, days },
    })
  }
  return alerts
}

function nextOccurrence(isoDate: string): Date {
  const d = parseISO(isoDate)
  const now = new Date()
  const candidate = new Date(now.getFullYear(), d.getMonth(), d.getDate())
  if (candidate < now) candidate.setFullYear(now.getFullYear() + 1)
  return candidate
}

// ── AI activity briefing (Claude Haiku) ───────────────────────────────────────

/**
 * Turns the raw client-activity signals (alerts) into a prioritized, actionable
 * briefing. Throws 'NO_KEY' if the Anthropic key isn't set so the caller can prompt.
 */
export async function generateActivityDigest(alerts: Alert[]): Promise<string> {
  const key = localStorage.getItem('apikey_anthropic')
  if (!key) throw new Error('NO_KEY')
  if (alerts.length === 0) return ''

  const lines = alerts
    .slice(0, 40)
    .map((a) => `- [${a.type}] ${a.contact_name}: ${a.title}${a.message ? ` — ${a.message}` : ''}`)
    .join('\n')

  const prompt = `You are an assistant to an enterprise account manager. Below are current signals about their clients (company news, stock moves, earnings, birthdays, life events, overdue check-ins, weather). Write a concise, prioritized activity briefing they can act on.

Use "## " for section headings and "- " for bullets. Use two sections:
## Act today
## Worth a note

For each bullet: name the client, what's happening in a few words, then a specific suggested action. One line each. Skip anything trivial, and don't invent facts beyond the signals.

Signals:
${lines}`

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
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error('REQUEST_FAILED')
  const data = await res.json()
  return (data.content?.[0]?.text as string) ?? ''
}

// ── Conference discovery (Claude Haiku) ───────────────────────────────────────

export interface ConferenceSuggestion {
  title: string
  date: string             // YYYY-MM-DD
  location?: string
  description?: string
  url?: string             // official website
}

/**
 * Asks Claude for real, well-known recurring industry conferences relevant to
 * the given interest, with best-estimate next dates. Throws 'NO_KEY' if the
 * Anthropic key isn't set so the caller can prompt the user.
 */
export async function discoverConferences(interest: string): Promise<ConferenceSuggestion[]> {
  const key = localStorage.getItem('apikey_anthropic')
  if (!key) throw new Error('NO_KEY')

  const today = new Date()
  const year = today.getFullYear()
  const prompt = `List up to 8 real, well-known recurring conferences and industry events relevant to: "${interest}".

Respond with ONLY a JSON array (no prose, no code fences). Each item:
{"title": string, "date": "YYYY-MM-DD", "location": string, "description": string, "url": string}

Rules:
- "date": the next upcoming occurrence. Estimate the event's usual month/season and use year ${year}; if that month has already passed (today is ${format(today, 'yyyy-MM-dd')}), use ${year + 1}.
- "location": "City, Country" or "Virtual".
- "description": one short sentence.
- "url": the official event website homepage (e.g. "https://www.ces.tech"). If you are not confident of the exact URL, omit the "url" field rather than guessing.
- Only include events you are genuinely confident are real. Better to return fewer than to invent events.`

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
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error('REQUEST_FAILED')
  const data = await res.json()
  const text: string = data.content?.[0]?.text ?? ''

  // Extract the JSON array even if wrapped in stray text or code fences
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1) throw new Error('PARSE_FAILED')
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new Error('PARSE_FAILED')
  }
  if (!Array.isArray(parsed)) throw new Error('PARSE_FAILED')

  return parsed
    .filter((c): c is ConferenceSuggestion =>
      !!c && typeof c.title === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.date)
    )
    .map((c) => ({
      title: c.title.trim(),
      date: c.date,
      location: typeof c.location === 'string' ? c.location.trim() : undefined,
      description: typeof c.description === 'string' ? c.description.trim() : undefined,
      url: typeof c.url === 'string' && /^https?:\/\//.test(c.url.trim()) ? c.url.trim() : undefined,
    }))
}
