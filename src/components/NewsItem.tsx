import { useState, useRef } from 'react'
import { Sparkles, Loader2, ExternalLink } from 'lucide-react'
import { CompanyHeadline } from '../lib/analytics'
import { format } from 'date-fns'

function formatNewsDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'MMM d, yyyy')
  } catch {
    return ''
  }
}

/** A news headline that lazily fetches an AI summary (via /api/summarize) on hover. */
export default function NewsItem({ headline }: { headline: CompanyHeadline }) {
  const [summary, setSummary] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'none' | 'nokey'>('idle')
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function loadSummary() {
    if (status !== 'idle') return // cached after first hover
    const key = localStorage.getItem('apikey_anthropic')
    if (!key) { setStatus('nokey'); return }
    setStatus('loading')
    fetch(`/api/summarize?url=${encodeURIComponent(headline.url)}`, {
      headers: { 'x-anthropic-key': key },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.summary) { setSummary(d.summary); setStatus('done') }
        else if (d.error === 'NO_KEY') setStatus('nokey')
        else setStatus('none')
      })
      .catch(() => setStatus('none'))
  }

  function onEnter() {
    setOpen(true)
    timer.current = setTimeout(loadSummary, 400) // don't fire on a quick pass-over
  }
  function onLeave() {
    if (timer.current) clearTimeout(timer.current)
    setOpen(false)
  }

  return (
    <div className="relative" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <a href={headline.url} target="_blank" rel="noopener noreferrer" className="block group">
        <p className="text-xs text-gray-700 leading-snug group-hover:text-brand-600 transition-colors line-clamp-3">
          {headline.title}
        </p>
        <div className="flex items-center gap-1 mt-1">
          {headline.source && <span className="text-[10px] text-gray-400">{headline.source}</span>}
          {headline.published_at && (
            <span className="text-[10px] text-gray-400">· {formatNewsDate(headline.published_at)}</span>
          )}
          <ExternalLink size={9} className="text-gray-300 group-hover:text-brand-400" />
        </div>
      </a>

      {open && status !== 'idle' && (
        <div className="absolute z-50 top-0 right-full mr-3 w-64 bg-white rounded-xl shadow-lift border border-gray-100 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles size={11} className="text-gold-500" />
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">AI summary</span>
          </div>
          {status === 'loading' && (
            <span className="text-xs text-gray-400 flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" /> Summarizing…
            </span>
          )}
          {status === 'done' && <p className="text-xs text-gray-600 leading-relaxed">{summary}</p>}
          {status === 'nokey' && (
            <p className="text-xs text-amber-700">Add your Anthropic key in Settings to turn on summaries.</p>
          )}
          {status === 'none' && (
            <p className="text-xs text-gray-400">Couldn't read this article — click through to open it.</p>
          )}
        </div>
      )}
    </div>
  )
}
