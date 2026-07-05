/**
 * Vercel serverless function — public-company financials for a ticker via
 * Financial Modeling Prep. The key comes from the `x-fmp-key` header (per-user,
 * set in Settings) or the FMP_API_KEY env var. Best-effort: always 200 with
 * { financials, error } so the one-pager degrades gracefully.
 */

export const config = { maxDuration: 15 }

const fmtMoney = (n) => {
  if (n == null || isNaN(n)) return null
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  return `$${n}`
}

export default async function handler(req, res) {
  const ticker = req.query?.ticker
  const key = req.headers['x-fmp-key'] || process.env.FMP_API_KEY
  if (!ticker || typeof ticker !== 'string') {
    return res.status(400).json({ financials: null, error: 'MISSING_TICKER' })
  }
  if (!key) {
    return res.status(200).json({ financials: null, error: 'NO_KEY' })
  }

  try {
    const base = 'https://financialmodelingprep.com/stable'
    const sym = encodeURIComponent(ticker)
    const [pRes, qRes] = await Promise.all([
      fetch(`${base}/profile?symbol=${sym}&apikey=${key}`, { signal: AbortSignal.timeout(10000) }),
      fetch(`${base}/quote?symbol=${sym}&apikey=${key}`, { signal: AbortSignal.timeout(10000) }),
    ])
    const pJson = await pRes.json().catch(() => null)
    const qJson = await qRes.json().catch(() => null)
    const prof = Array.isArray(pJson) ? pJson[0] : pJson
    const quote = Array.isArray(qJson) ? qJson[0] : qJson

    if (prof?.['Error Message'] || quote?.['Error Message']) {
      return res.status(200).json({ financials: null, error: 'KEY_OR_PLAN' })
    }
    if (!prof && !quote) {
      return res.status(200).json({ financials: null, error: 'NO_DATA' })
    }

    const rangeParts = typeof prof?.range === 'string' ? prof.range.split('-').map((s) => parseFloat(s)) : []
    const financials = {
      name: prof?.companyName || quote?.name || ticker,
      industry: prof?.industry || null,
      marketCap: fmtMoney(prof?.marketCap ?? quote?.marketCap),
      pe: quote?.pe != null ? String(Math.round(quote.pe * 10) / 10) : null,
      eps: quote?.eps != null ? String(quote.eps) : null,
      week52High: quote?.yearHigh ?? rangeParts[1] ?? null,
      week52Low: quote?.yearLow ?? rangeParts[0] ?? null,
      nextEarnings: quote?.earningsAnnouncement ? String(quote.earningsAnnouncement).slice(0, 10) : null,
    }
    return res.status(200).json({ financials })
  } catch {
    return res.status(200).json({ financials: null, error: 'ERROR' })
  }
}
