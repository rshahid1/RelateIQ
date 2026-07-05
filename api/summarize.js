/**
 * Vercel serverless function — summarize a news article by URL.
 *
 * Runs on Vercel's backend so it can fetch the article without the browser's
 * CORS limits, then asks Claude Haiku for a short summary. The caller passes
 * their own Anthropic key via the `x-anthropic-key` header (never stored).
 * Always responds 200 with { summary, error } so the client can fall back
 * gracefully to the headline.
 */

function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|section|article|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#?[a-z0-9]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

export default async function handler(req, res) {
  const url = req.query?.url
  const key = req.headers['x-anthropic-key']

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ summary: null, error: 'MISSING_URL' })
  }
  if (!key) {
    return res.status(200).json({ summary: null, error: 'NO_KEY' })
  }

  try {
    const article = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
        Accept: 'text/html',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(9000),
    })
    const html = await article.text()
    const text = extractText(html).slice(0, 6000)
    if (text.length < 250) {
      return res.status(200).json({ summary: null, error: 'NO_CONTENT' })
    }

    const claude = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': key,
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 180,
        messages: [
          {
            role: 'user',
            content: `Summarize this news article in 2-3 short, factual sentences. No preamble — just the summary.\n\n${text}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!claude.ok) {
      return res.status(200).json({ summary: null, error: 'AI_FAILED' })
    }
    const data = await claude.json()
    const summary = data?.content?.[0]?.text?.trim() || null
    return res.status(200).json({ summary, error: summary ? null : 'EMPTY' })
  } catch {
    return res.status(200).json({ summary: null, error: 'FETCH_FAILED' })
  }
}
