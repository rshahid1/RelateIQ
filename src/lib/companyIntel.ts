/**
 * Company (account) intelligence — stock snapshot, financials, and an AI brief.
 * Powers the account one-pager. Everything degrades gracefully (null on failure).
 */
import { CompanyHeadline } from './analytics'
import { SELLER_LENS, SIGNAL_TRIGGERS } from './signals'

export interface StockSnapshot {
  price: number
  changePercent: number
  currency?: string
  high52?: number
  low52?: number
  spark: number[]
}

/** Current price, day change, 52-week range and a mini price trend — free chart endpoint. */
export async function fetchStockSnapshot(ticker: string): Promise<StockSnapshot | null> {
  try {
    const res = await fetch(`/yfinance/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1mo`)
    if (!res.ok) return null
    const data = await res.json()
    const r = data.chart?.result?.[0]
    const meta = r?.meta
    if (!meta?.regularMarketPrice) return null
    const closes: number[] = (r.indicators?.quote?.[0]?.close ?? []).filter((x: number | null) => x != null)
    // Daily change = current price vs the most recent PRIOR daily close. Yahoo's
    // chartPreviousClose is relative to the range start (a month ago here), so use
    // the second-to-last close in the series instead.
    const prev = closes.length >= 2 ? closes[closes.length - 2] : (meta.chartPreviousClose ?? meta.previousClose)
    return {
      price: meta.regularMarketPrice,
      changePercent: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0,
      currency: meta.currency,
      high52: meta.fiftyTwoWeekHigh,
      low52: meta.fiftyTwoWeekLow,
      spark: closes.slice(-30),
    }
  } catch {
    return null
  }
}

export interface LastEarnings {
  date: string
  epsActual: number | null
  epsEstimated: number | null
  revenue: string | null
  beat: boolean | null
  note: string
}

export interface CompanyFinancials {
  name?: string
  industry?: string | null
  price?: number | null
  changePercent?: number | null
  marketCap?: string | null
  pe?: string | null
  eps?: string | null
  profitMargin?: string | null
  grossMargin?: string | null
  beta?: string | null
  dividend?: string | null
  week52High?: number | string | null
  week52Low?: number | string | null
  nextEarnings?: string | null
  lastEarnings?: LastEarnings | null
}

/** Fundamentals via the /api/company backend (Financial Modeling Prep). Null when unavailable. */
export async function fetchCompanyFinancials(ticker: string): Promise<CompanyFinancials | null> {
  try {
    const key = localStorage.getItem('apikey_fmp')
    const res = await fetch(`/api/company?ticker=${encodeURIComponent(ticker)}`, {
      headers: key ? { 'x-fmp-key': key } : undefined,
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.financials ?? null
  } catch {
    return null
  }
}

const joinList = (parts: string[]): string =>
  parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`

/**
 * Plain-language financials + earnings summary, built deterministically from the
 * FMP data + live price. Always available for public companies (no AI needed),
 * so the one-pager has substance even when there's little news.
 */
export function financialSummary(
  ticker: string,
  fin: CompanyFinancials | null,
  stock: StockSnapshot | null
): string | null {
  if (!fin && !stock) return null
  const out: string[] = []

  const val: string[] = []
  if (fin?.marketCap) val.push(`a market cap of ${fin.marketCap}`)
  if (fin?.pe) val.push(`a P/E of ${fin.pe}`)
  if (fin?.profitMargin) val.push(`a ${fin.profitMargin} net margin`)
  if (val.length) out.push(`${ticker} carries ${joinList(val)}.`)

  const price = fin?.price ?? stock?.price
  const chg = fin?.changePercent ?? stock?.changePercent
  if (price != null) {
    let p = `Shares trade near $${price.toFixed(2)}`
    if (chg != null) p += `, ${chg >= 0 ? 'up' : 'down'} ${Math.abs(chg).toFixed(1)}% on the day`
    const hi = typeof fin?.week52High === 'number' ? fin.week52High : stock?.high52
    const lo = typeof fin?.week52Low === 'number' ? fin.week52Low : stock?.low52
    if (hi && lo) p += ` (52-week range ${lo.toFixed(0)}–${hi.toFixed(0)})`
    out.push(p + '.')
  }

  if (fin?.lastEarnings) {
    const e = fin.lastEarnings
    let p = `In its most recent report (${e.date}), it posted EPS of $${e.epsActual}`
    if (e.epsEstimated != null) p += `, ${e.beat ? 'beating' : 'missing'} the $${e.epsEstimated} estimate`
    if (e.revenue) p += `, on revenue of ${e.revenue}`
    out.push(p + '.')
  }
  if (fin?.nextEarnings) out.push(`Its next earnings report is expected around ${fin.nextEarnings}.`)

  return out.length ? out.join(' ') : null
}

/**
 * AI account brief — reads the (already relevance-filtered) recent news and
 * writes a tight "what they've been up to + why it matters + a natural reason to
 * reach out" digest for an account manager. Needs the Anthropic key.
 */
export async function generateAccountBrief(
  company: string,
  headlines: CompanyHeadline[],
  stockNote?: string
): Promise<string | null> {
  const key = localStorage.getItem('apikey_anthropic')
  if (!key || headlines.length === 0) return null
  const news = headlines.map((h) => `- ${h.title}${h.source ? ` (${h.source})` : ''}`).join('\n')
  const prompt = `${SELLER_LENS}

${SIGNAL_TRIGGERS}

You're prepping to engage "${company}" (an insurer). Based only on the signals below, write a brief you can act on. Format with "## " headings and "- " bullets, exactly these sections:

## What changed on their balance sheet
(2-4 bullets: the developments most relevant to how they invest their general account — capital, earnings/investment income, M&A, leadership, ratings, reinsurance/annuity deals, private-credit moves. Concrete and specific.)
## Why it matters to you
(1-2 bullets: the opening it creates for a private-credit / core fixed-income / OCIO conversation, and who to approach — CIO, Treasurer, CFO)
## A natural reason to reach out
(1 bullet: a specific, non-salesy opener tied to a real signal above)

Be signal-only — skip anything that doesn't bear on their investments. Don't invent facts. Weave in the financial context below where relevant (e.g. investment-income trends or a capital raise are strong hooks).
${stockNote ? `\nFinancial context: ${stockNote}` : ''}

Recent news:
${news}`

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
        max_tokens: 500,
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
