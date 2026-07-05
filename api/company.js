/**
 * Vercel serverless function — public-company financials for a ticker.
 *
 * Yahoo Finance gates its quoteSummary endpoint behind a cookie + "crumb", so
 * we grab those server-side first, then fetch the fundamentals. Best-effort:
 * always 200 with { financials, error } so the one-pager degrades gracefully.
 */

export const config = { maxDuration: 20 }

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36'

async function getCrumb() {
  let cookie = ''
  try {
    const r = await fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(8000) })
    cookie = (r.headers.get('set-cookie') || '').split(';')[0]
  } catch { /* try next */ }
  if (!cookie) {
    try {
      const r = await fetch('https://finance.yahoo.com/quote/AAPL', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) })
      cookie = (r.headers.get('set-cookie') || '').split(';')[0]
    } catch { /* give up */ }
  }
  if (!cookie) return null
  try {
    const cr = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, cookie },
      signal: AbortSignal.timeout(8000),
    })
    const crumb = (await cr.text()).trim()
    if (!crumb || crumb.length > 40 || /error|too many|<html/i.test(crumb)) return null
    return { cookie, crumb }
  } catch {
    return null
  }
}

const pct = (r) => (r != null ? Math.round(r * 1000) / 10 : null)

export default async function handler(req, res) {
  const ticker = req.query?.ticker
  if (!ticker || typeof ticker !== 'string') {
    return res.status(400).json({ financials: null, error: 'MISSING_TICKER' })
  }
  try {
    const c = await getCrumb()
    if (!c) return res.status(200).json({ financials: null, error: 'NO_CRUMB' })

    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?crumb=${encodeURIComponent(c.crumb)}&modules=price,summaryDetail,financialData,defaultKeyStatistics,calendarEvents`
    const r = await fetch(url, { headers: { 'User-Agent': UA, cookie: c.cookie }, signal: AbortSignal.timeout(10000) })
    if (!r.ok) return res.status(200).json({ financials: null, error: 'FETCH_FAILED' })
    const j = await r.json()
    const d = j.quoteSummary?.result?.[0]
    if (!d) return res.status(200).json({ financials: null, error: 'NO_DATA' })

    const p = d.price || {}
    const fd = d.financialData || {}
    const ks = d.defaultKeyStatistics || {}
    const sd = d.summaryDetail || {}
    const cal = d.calendarEvents || {}

    const financials = {
      name: p.longName || p.shortName || ticker,
      marketCap: p.marketCap?.fmt || null,
      pe: sd.trailingPE?.fmt || ks.forwardPE?.fmt || null,
      revenue: fd.totalRevenue?.fmt || null,
      revenueGrowth: pct(fd.revenueGrowth?.raw),
      profitMargin: pct(fd.profitMargins?.raw),
      recommendation: fd.recommendationKey || null,
      targetPrice: fd.targetMeanPrice?.fmt || null,
      week52High: sd.fiftyTwoWeekHigh?.fmt || null,
      week52Low: sd.fiftyTwoWeekLow?.fmt || null,
      nextEarnings: cal.earnings?.earningsDate?.[0]?.fmt || null,
    }
    return res.status(200).json({ financials })
  } catch {
    return res.status(200).json({ financials: null, error: 'ERROR' })
  }
}
