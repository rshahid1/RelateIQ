/**
 * Vercel serverless function — general web search via Tavily, for the contact
 * "Get to know them" persona. Key comes from the `x-tavily-key` header (per-user,
 * set in Settings) or the TAVILY_API_KEY env var. Best-effort: always 200 with
 * { results, error } so the persona degrades to the free news sources gracefully.
 */

export const config = { maxDuration: 15 }

const hostname = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

export default async function handler(req, res) {
  const q = req.query?.q
  const key = req.headers['x-tavily-key'] || process.env.TAVILY_API_KEY
  if (!q || typeof q !== 'string') {
    return res.status(400).json({ results: [], error: 'MISSING_QUERY' })
  }
  if (!key) {
    return res.status(200).json({ results: [], error: 'NO_KEY' })
  }

  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query: q,
        search_depth: 'advanced',
        max_results: 6,
        include_answer: false,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(12000),
    })
    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      return res.status(200).json({ results: [], error: 'SEARCH_FAILED', detail: detail.slice(0, 140) })
    }
    const data = await r.json()
    const results = (Array.isArray(data.results) ? data.results : []).map((x) => ({
      title: x.title,
      url: x.url,
      source: hostname(x.url),
      content: typeof x.content === 'string' ? x.content.slice(0, 400) : '',
    }))
    return res.status(200).json({ results })
  } catch {
    return res.status(200).json({ results: [], error: 'ERROR' })
  }
}
