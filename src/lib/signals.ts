/**
 * Investment-signal engine — tuned for an institutional asset manager selling
 * balance-sheet (general-account) solutions to insurers: private credit &
 * alternatives, core/core-plus public fixed income, and OCIO. The single source
 * of truth for "what counts as signal," shared across the news filter, account
 * brief, and prospect research so every insight speaks the same language.
 */
import { getAiModel } from './ai'

export const SELLER_LENS =
  `You work for an institutional asset manager that manages insurers' balance-sheet (general-account) assets — ` +
  `private credit & alternatives, core/core-plus public fixed income, and outsourced-CIO (OCIO) solutions. ` +
  `The clients and prospects are insurers: life & annuity writers, P&C carriers, reinsurers, and PE-backed/mid-size carriers. ` +
  `What matters is any signal that an insurer has assets to deploy or is rethinking its portfolio, and who the ` +
  `investment decision-maker is (CIO, Treasurer, Head of Investments, CFO).`

export const SIGNAL_TRIGGERS =
  `Relevant trigger types (balance-sheet / investment signals only):
- Leadership change: new CIO, Treasurer, Head of Investments, or CFO (a new buyer to meet)
- PE / private-equity acquisition of or investment in the insurer (they push into private credit & alternatives)
- Capital raise, surplus or AUM growth, strong net inflows (more assets to deploy)
- M&A / consolidation (combined portfolios, integration, a likely investment RFP)
- Annuity block, pension-risk-transfer, or asset-intensive reinsurance deal (needs liability-matched assets)
- Rating action (A.M. Best, S&P, Moody's) or RBC/capital pressure (a yield or efficiency need)
- Earnings commentary on net investment income, portfolio yield, or reinvestment
- A public move into private credit / alternatives, or an OCIO / outsourcing search
Ignore anything that doesn't bear on how they invest their balance sheet — product launches, hires outside investments, routine PR, ratings affirmations with no change, generic market stories.`

export interface InvestmentSignal {
  headline: string
  url?: string
  source?: string
  trigger: string                       // short label, e.g. "PE acquisition"
  why: string                           // why it matters to an insurance asset manager
  buyer: string                         // the role to approach
  opener: string                        // a specific, non-salesy opener
  strength: 'hot' | 'warm' | 'watch'
}

/**
 * From a pool of headlines about an insurer, keep ONLY balance-sheet/investment
 * triggers and return them as structured, actionable signals. [] on no key/failure.
 */
export async function extractInvestmentSignals(
  company: string,
  headlines: { title: string; url?: string; source?: string }[]
): Promise<InvestmentSignal[]> {
  const key = localStorage.getItem('apikey_anthropic')
  if (!key || headlines.length === 0) return []

  const list = headlines.map((h, i) => `${i}. ${h.title}${h.source ? ` — ${h.source}` : ''}`).join('\n')
  const prompt = `${SELLER_LENS}

${SIGNAL_TRIGGERS}

The insurer is "${company}". From the numbered headlines below, extract ONLY the ones that are genuine balance-sheet / investment triggers. Drop everything else — it's better to return nothing than noise.

Return ONLY a JSON array (no prose, no code fences). One object per kept headline:
{"i": <headline number>, "trigger": "<2-4 word label>", "why": "<one sentence: why this matters for an asset manager pitching their general account>", "buyer": "<the role to approach, e.g. CIO / Treasurer / CFO>", "opener": "<one specific, non-salesy opening line tied to this exact event>", "strength": "hot" | "warm" | "watch"}

strength: "hot" = clear near-term reason to engage (new CIO, PE deal, capital raise, M&A); "warm" = a real but softer angle; "watch" = worth noting, not yet actionable.

Headlines:
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
        model: getAiModel(),
        max_tokens: 900,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return []
    const data = await res.json()
    const text: string = data?.content?.[0]?.text ?? ''
    const start = text.indexOf('[')
    const end = text.lastIndexOf(']')
    if (start === -1 || end === -1) return []
    const parsed = JSON.parse(text.slice(start, end + 1))
    if (!Array.isArray(parsed)) return []
    const order = { hot: 0, warm: 1, watch: 2 } as const
    return parsed
      .map((s: Record<string, unknown>) => {
        const h = typeof s.i === 'number' ? headlines[s.i] : undefined
        if (!h) return null
        const strength = (['hot', 'warm', 'watch'].includes(s.strength as string) ? s.strength : 'warm') as InvestmentSignal['strength']
        return {
          headline: h.title,
          url: h.url,
          source: h.source,
          trigger: String(s.trigger ?? 'Signal'),
          why: String(s.why ?? ''),
          buyer: String(s.buyer ?? ''),
          opener: String(s.opener ?? ''),
          strength,
        } as InvestmentSignal
      })
      .filter((x: InvestmentSignal | null): x is InvestmentSignal => !!x)
      .sort((a: InvestmentSignal, b: InvestmentSignal) => order[a.strength] - order[b.strength])
  } catch {
    return []
  }
}
