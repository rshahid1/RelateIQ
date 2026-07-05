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
const fmtPct = (n) => (n == null || isNaN(n) ? null : `${(n * 100).toFixed(1)}%`)

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
    const get = (path) =>
      fetch(`${base}/${path}?symbol=${sym}&apikey=${key}`, { signal: AbortSignal.timeout(10000) })
        .then((r) => r.json())
        .catch(() => null)

    const [pJson, qJson, rJson, eJson] = await Promise.all([
      get('profile'),
      get('quote'),
      get('ratios-ttm'),
      fetch(`${base}/earnings?symbol=${sym}&limit=5&apikey=${key}`, { signal: AbortSignal.timeout(10000) })
        .then((r) => r.json())
        .catch(() => null),
    ])
    const prof = Array.isArray(pJson) ? pJson[0] : pJson
    const quote = Array.isArray(qJson) ? qJson[0] : qJson
    const ratios = Array.isArray(rJson) ? rJson[0] : rJson

    if (prof?.['Error Message'] || quote?.['Error Message']) {
      return res.status(200).json({ financials: null, error: 'KEY_OR_PLAN' })
    }
    if (!prof && !quote) {
      return res.status(200).json({ financials: null, error: 'NO_DATA' })
    }

    // Earnings — next scheduled date + latest reported (beat/miss)
    const todayStr = new Date().toISOString().slice(0, 10)
    const earn = Array.isArray(eJson) ? eJson : []
    const upcoming = earn
      .filter((e) => e.date >= todayStr && e.epsActual == null)
      .sort((a, b) => (a.date < b.date ? -1 : 1))[0]
    const reported = earn
      .filter((e) => e.epsActual != null)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0]
    let lastEarnings = null
    if (reported) {
      const beat = reported.epsEstimated != null ? reported.epsActual >= reported.epsEstimated : null
      lastEarnings = {
        date: reported.date,
        epsActual: reported.epsActual,
        epsEstimated: reported.epsEstimated,
        revenue: fmtMoney(reported.revenueActual),
        beat,
        note: `${reported.date}: EPS $${reported.epsActual}${reported.epsEstimated != null ? ` vs $${reported.epsEstimated} est (${beat ? 'beat' : 'miss'})` : ''}${reported.revenueActual ? `, revenue ${fmtMoney(reported.revenueActual)}` : ''}`,
      }
    }

    const rangeParts = typeof prof?.range === 'string' ? prof.range.split('-').map((s) => parseFloat(s)) : []
    const pe = ratios?.priceToEarningsRatioTTM
    const eps = ratios?.netIncomePerShareTTM
    const financials = {
      name: prof?.companyName || quote?.name || ticker,
      industry: prof?.industry || null,
      marketCap: fmtMoney(prof?.marketCap ?? quote?.marketCap),
      pe: pe != null ? String(Math.round(pe * 10) / 10) : null,
      eps: eps != null ? String(Math.round(eps * 100) / 100) : null,
      profitMargin: fmtPct(ratios?.netProfitMarginTTM),
      grossMargin: fmtPct(ratios?.grossProfitMarginTTM),
      week52High: quote?.yearHigh ?? rangeParts[1] ?? null,
      week52Low: quote?.yearLow ?? rangeParts[0] ?? null,
      nextEarnings: upcoming?.date ?? null,
      lastEarnings,
    }
    return res.status(200).json({ financials })
  } catch {
    return res.status(200).json({ financials: null, error: 'ERROR' })
  }
}
