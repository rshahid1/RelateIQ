/**
 * Company (account) intelligence — stock snapshot, financials, and an AI brief.
 * Powers the account one-pager. Everything degrades gracefully (null on failure).
 */
import { CompanyHeadline } from './analytics'

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
    const prev = meta.chartPreviousClose ?? meta.previousClose
    const closes: number[] = (r.indicators?.quote?.[0]?.close ?? []).filter((x: number | null) => x != null)
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

export interface CompanyFinancials {
  name?: string
  marketCap?: string | null
  pe?: string | null
  revenue?: string | null
  revenueGrowth?: number | null
  profitMargin?: number | null
  recommendation?: string | null
  targetPrice?: string | null
  week52High?: string | null
  week52Low?: string | null
  nextEarnings?: string | null
}

/** Fundamentals via the /api/company backend (Yahoo crumb). Null when unavailable. */
export async function fetchCompanyFinancials(ticker: string): Promise<CompanyFinancials | null> {
  try {
    const res = await fetch(`/api/company?ticker=${encodeURIComponent(ticker)}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.financials ?? null
  } catch {
    return null
  }
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
  const prompt = `You are the sharpest account manager alive, prepping to stay close to a client at "${company}". Based only on the recent signals below, write a brief they can act on. Format with "## " headings and "- " bullets, exactly these sections:

## What's happening
(2-4 bullets: the most important recent developments, concrete and specific)
## Why it matters to you
(1-2 bullets: the angle for an account manager / the relationship implication)
## A natural reason to reach out
(1 bullet: a specific, non-salesy opener tied to a real signal)

Be signal-only — skip anything trivial. Don't invent facts.
${stockNote ? `\nStock: ${stockNote}` : ''}

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
