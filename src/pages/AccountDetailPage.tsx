import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Building2, TrendingUp, TrendingDown, Newspaper, Sparkles,
  Loader2, Users, BarChart2, CalendarClock,
} from 'lucide-react'
import { Contact } from '../types'
import { fetchCompanyHeadlines, filterRelevantHeadlines, CompanyHeadline } from '../lib/analytics'
import {
  fetchStockSnapshot, fetchCompanyFinancials, generateAccountBrief,
  StockSnapshot, CompanyFinancials,
} from '../lib/companyIntel'
import Avatar from '../components/Avatar'
import NewsItem from '../components/NewsItem'

export default function AccountDetailPage({ contacts }: { contacts: Contact[] }) {
  const { company: rawCompany } = useParams<{ company: string }>()
  const company = decodeURIComponent(rawCompany ?? '')

  const accountContacts = useMemo(
    () => contacts.filter((c) => c.company?.trim() === company),
    [contacts, company]
  )
  const ticker = accountContacts.find((c) => c.ticker)?.ticker
  const newsTerms = accountContacts.find((c) => c.news_terms)?.news_terms
  const roleContext = accountContacts.find((c) => c.title)?.title

  const [stock, setStock] = useState<StockSnapshot | null>(null)
  const [fin, setFin] = useState<CompanyFinancials | null>(null)
  const [headlines, setHeadlines] = useState<CompanyHeadline[]>([])
  const [newsLoading, setNewsLoading] = useState(true)
  const [brief, setBrief] = useState<string | null>(null)
  const [briefStatus, setBriefStatus] = useState<'idle' | 'loading' | 'done' | 'nokey' | 'none'>('idle')

  useEffect(() => {
    if (!ticker) { setStock(null); setFin(null); return }
    let active = true
    fetchStockSnapshot(ticker).then((s) => active && setStock(s))
    fetchCompanyFinancials(ticker).then((f) => active && setFin(f))
    return () => { active = false }
  }, [ticker])

  useEffect(() => {
    if (!company) return
    let active = true
    setNewsLoading(true)
    setBriefStatus('idle')
    fetchCompanyHeadlines(company, newsTerms, 18)
      .then((items) => filterRelevantHeadlines(items, { company, title: roleContext, hint: newsTerms }))
      .then(async (items) => {
        if (!active) return
        const top = items.slice(0, 8)
        setHeadlines(top)
        setNewsLoading(false)
        if (top.length === 0) { setBriefStatus('none'); return }
        if (!localStorage.getItem('apikey_anthropic')) { setBriefStatus('nokey'); return }
        setBriefStatus('loading')
        const note = stock
          ? `${ticker} ${stock.changePercent >= 0 ? 'up' : 'down'} ${Math.abs(stock.changePercent).toFixed(1)}% recently`
          : undefined
        const b = await generateAccountBrief(company, top, note)
        if (active) { setBrief(b); setBriefStatus(b ? 'done' : 'none') }
      })
      .catch(() => { if (active) { setHeadlines([]); setNewsLoading(false); setBriefStatus('none') } })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, newsTerms, roleContext])

  if (accountContacts.length === 0) {
    return (
      <div className="p-8 text-gray-400">
        <Link to="/accounts" className="text-brand-500 hover:underline text-sm">← All accounts</Link>
        <p className="mt-4">No contacts found for “{company}”.</p>
      </div>
    )
  }

  const up = (stock?.changePercent ?? 0) >= 0

  return (
    <div className="max-w-5xl">
      <Link to="/accounts" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
        <ArrowLeft size={14} /> All accounts
      </Link>

      {/* Header */}
      <div className="card mb-5">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
            <Building2 size={26} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{company}</h1>
              {ticker && <span className="badge bg-emerald-50 text-emerald-700">{ticker}</span>}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex -space-x-2">
                {accountContacts.slice(0, 6).map((c) => (
                  <Link key={c.id} to={`/contacts/${c.id}`} title={`${c.first_name} ${c.last_name}`}>
                    <Avatar name={`${c.first_name} ${c.last_name}`} url={c.avatar_url} size="sm" />
                  </Link>
                ))}
              </div>
              <span className="text-xs text-gray-400">
                {accountContacts.length} {accountContacts.length === 1 ? 'contact' : 'contacts'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: brief + news */}
        <div className="lg:col-span-2 space-y-5">
          {/* AI account brief */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <Sparkles size={16} className="text-gold-500" /> What {company} has been up to
            </h2>
            {briefStatus === 'loading' && (
              <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Reading the latest signals…</p>
            )}
            {briefStatus === 'nokey' && (
              <p className="text-sm text-amber-700">Add your Anthropic key in Settings to generate the account brief.</p>
            )}
            {briefStatus === 'none' && (
              <p className="text-sm text-gray-400">Not enough recent news to brief on yet.</p>
            )}
            {briefStatus === 'done' && brief && <div className="space-y-1">{renderBrief(brief)}</div>}
            {briefStatus === 'idle' && newsLoading && (
              <p className="text-sm text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Gathering signals…</p>
            )}
          </div>

          {/* News */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Newspaper size={16} className="text-amber-500" /> Recent news
            </h2>
            {newsLoading ? (
              <p className="text-sm text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Fetching news…</p>
            ) : headlines.length === 0 ? (
              <p className="text-sm text-gray-400">No relevant recent news found.</p>
            ) : (
              <div className="space-y-3">
                {headlines.map((h, i) => <NewsItem key={i} headline={h} />)}
              </div>
            )}
          </div>
        </div>

        {/* Right: financials + contacts */}
        <div className="space-y-5">
          {/* Stock / financials */}
          {ticker && (
            <div className="card">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <BarChart2 size={16} className="text-brand-500" /> {ticker}
              </h2>
              {stock ? (
                <>
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="text-2xl font-bold text-gray-900 leading-none">
                        {stock.currency === 'USD' ? '$' : ''}{stock.price.toFixed(2)}
                      </p>
                      <p className={`text-sm font-medium mt-1 flex items-center gap-1 ${up ? 'text-emerald-600' : 'text-red-500'}`}>
                        {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                        {up ? '+' : ''}{stock.changePercent.toFixed(2)}%
                      </p>
                    </div>
                    <Sparkline data={stock.spark} up={up} />
                  </div>
                  {(stock.low52 || stock.high52) && (
                    <p className="text-[11px] text-gray-400 mt-2">
                      52-wk: {stock.low52?.toFixed(0)} – {stock.high52?.toFixed(0)}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-400 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Loading price…</p>
              )}

              {fin && (
                <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {fin.marketCap && <Stat label="Market cap" value={fin.marketCap} />}
                  {fin.pe && <Stat label="P/E" value={fin.pe} />}
                  {fin.revenue && <Stat label="Revenue" value={fin.revenue} />}
                  {fin.revenueGrowth != null && <Stat label="Rev. growth" value={`${fin.revenueGrowth}%`} />}
                  {fin.profitMargin != null && <Stat label="Margin" value={`${fin.profitMargin}%`} />}
                  {fin.targetPrice && <Stat label="Avg target" value={fin.targetPrice} />}
                  {fin.recommendation && <Stat label="Analysts" value={fin.recommendation.replace(/_/g, ' ')} />}
                </div>
              )}
              {fin?.nextEarnings && (
                <p className="text-xs text-sky-600 mt-3 flex items-center gap-1.5">
                  <CalendarClock size={12} /> Next earnings: {fin.nextEarnings}
                </p>
              )}
            </div>
          )}

          {/* Contacts */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <Users size={16} className="text-brand-500" /> Contacts
            </h2>
            <div className="space-y-2">
              {accountContacts.map((c) => (
                <Link key={c.id} to={`/contacts/${c.id}`} className="flex items-center gap-2.5 group">
                  <Avatar name={`${c.first_name} ${c.last_name}`} url={c.avatar_url} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate group-hover:text-brand-600">
                      {c.first_name} {c.last_name}
                    </p>
                    {c.title && <p className="text-xs text-gray-400 truncate">{c.title}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-900 capitalize">{value}</p>
    </div>
  )
}

function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 96
  const h = 34
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ')
  return (
    <svg width={w} height={h} className="flex-shrink-0">
      <polyline points={pts} fill="none" stroke={up ? '#1f8a6d' : '#ef4444'} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function renderBrief(text: string) {
  return text.split('\n').map((line, i) => {
    const t = line.trim().replace(/\*\*/g, '')
    if (!t) return null
    if (t.startsWith('## ')) {
      return <h4 key={i} className="font-semibold text-gray-900 text-sm mt-3 first:mt-0">{t.slice(3)}</h4>
    }
    if (/^[-*•]\s/.test(t)) {
      return <li key={i} className="text-sm text-gray-700 ml-5 list-disc leading-relaxed">{t.replace(/^[-*•]\s/, '')}</li>
    }
    return <p key={i} className="text-sm text-gray-700 leading-relaxed">{t}</p>
  })
}
