import { useState } from 'react'
import { KeyRound, CloudRain, Newspaper, Linkedin, Save, CheckCircle2, Chrome, Sparkles, LineChart } from 'lucide-react'
import { getGoogleClientId, setGoogleClientId } from '../lib/google'
import { AI_MODELS, getAiModel, setAiModel } from '../lib/ai'

interface ApiKeys {
  newsapi: string
  rapidapi: string
  anthropic: string
  fmp: string
}

export default function SettingsPage() {
  const [googleClientId, setGoogleClientIdState] = useState(getGoogleClientId)
  const [keys, setKeys] = useState<ApiKeys>({
    newsapi: localStorage.getItem('apikey_newsapi') ?? '',
    rapidapi: localStorage.getItem('apikey_rapidapi') ?? '',
    anthropic: localStorage.getItem('apikey_anthropic') ?? '',
    fmp: localStorage.getItem('apikey_fmp') ?? '',
  })
  const [aiModel, setAiModelState] = useState(getAiModel)
  const [saved, setSaved] = useState(false)
  const [testingKey, setTestingKey] = useState(false)
  const [keyTest, setKeyTest] = useState<{ ok: boolean; msg: string } | null>(null)

  async function testAnthropicKey() {
    setTestingKey(true)
    setKeyTest(null)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': keys.anthropic.trim(),
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      })
      if (res.ok) {
        setKeyTest({ ok: true, msg: 'Working — your key is valid and funded.' })
      } else {
        const data = await res.json().catch(() => null)
        setKeyTest({ ok: false, msg: data?.error?.message || `Request failed (HTTP ${res.status}).` })
      }
    } catch (e) {
      setKeyTest({ ok: false, msg: e instanceof Error ? e.message : 'Could not reach Anthropic.' })
    }
    setTestingKey(false)
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setGoogleClientId(googleClientId)
    if (keys.newsapi) localStorage.setItem('apikey_newsapi', keys.newsapi)
    else localStorage.removeItem('apikey_newsapi')
    if (keys.rapidapi) localStorage.setItem('apikey_rapidapi', keys.rapidapi)
    else localStorage.removeItem('apikey_rapidapi')
    if (keys.anthropic) localStorage.setItem('apikey_anthropic', keys.anthropic)
    else localStorage.removeItem('apikey_anthropic')
    if (keys.fmp) localStorage.setItem('apikey_fmp', keys.fmp.trim())
    else localStorage.removeItem('apikey_fmp')
    setAiModel(aiModel)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Settings</h1>
      <p className="text-sm text-gray-500 mb-8">
        Weather and company news work out of the box. Add a RapidAPI key to also enable
        LinkedIn job-change detection and local events. Keys are stored locally in your browser only.
      </p>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Google Sign-In */}
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-blue-50 rounded-xl p-2">
              <Chrome size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">Google Sign-In</p>
              <p className="text-xs text-gray-500">Lets users log in with their Google account instead of a password.</p>
            </div>
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-brand-500 hover:underline whitespace-nowrap">Get Client ID →</a>
          </div>
          <div className="flex items-center gap-2">
            <KeyRound size={13} className="text-gray-400 flex-shrink-0" />
            <input
              className="input font-mono text-xs"
              type="text"
              placeholder="1234567890-abc….apps.googleusercontent.com"
              value={googleClientId}
              onChange={(e) => setGoogleClientIdState(e.target.value)}
              autoComplete="off"
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Create a <span className="font-medium">Web application</span> credential and add <code className="bg-gray-100 px-1 rounded">http://localhost:5173</code> to Authorized JavaScript origins.
          </p>
        </div>

        {/* Weather — no key needed */}
        <div className="card border-emerald-100 bg-emerald-50/30">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-50 rounded-xl p-2">
              <CloudRain size={16} className="text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">Weather alerts <span className="badge bg-emerald-100 text-emerald-700 ml-1">Active</span></p>
              <p className="text-xs text-gray-500">Powered by Open-Meteo — free, no API key required. Severe weather in any contact's city triggers an alert automatically.</p>
            </div>
          </div>
        </div>

        {/* Company news — GDELT by default, NewsAPI optional */}
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-amber-50 rounded-xl p-2">
              <Newspaper size={16} className="text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">Company news <span className="badge bg-emerald-100 text-emerald-700 ml-1">Active</span></p>
              <p className="text-xs text-gray-500">Works out of the box via GDELT (no key). Add a NewsAPI key below for higher-quality headlines.</p>
            </div>
            <a href="https://newsapi.org" target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-brand-500 hover:underline">Get key →</a>
          </div>
          <div className="flex items-center gap-2">
            <KeyRound size={13} className="text-gray-400 flex-shrink-0" />
            <input
              className="input"
              type="password"
              placeholder="Optional — NewsAPI key"
              value={keys.newsapi}
              onChange={(e) => setKeys((k) => ({ ...k, newsapi: e.target.value }))}
            />
          </div>
        </div>

        {/* RapidAPI (LinkedIn + Events) */}
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-indigo-50 rounded-xl p-2">
              <Linkedin size={16} className="text-indigo-600" />
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900 flex items-center gap-2">
                RapidAPI
                {keys.rapidapi && <span className="badge bg-emerald-100 text-emerald-700">Connected</span>}
              </p>
              <p className="text-xs text-gray-500">LinkedIn profile data + local event lookup</p>
            </div>
            <a href="https://rapidapi.com" target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-brand-500 hover:underline">Get key →</a>
          </div>
          <div className="flex items-center gap-2">
            <KeyRound size={13} className="text-gray-400 flex-shrink-0" />
            <input
              className="input"
              type="password"
              placeholder="…"
              value={keys.rapidapi}
              onChange={(e) => setKeys((k) => ({ ...k, rapidapi: e.target.value }))}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Used for: <span className="font-medium">Fresh LinkedIn Data API</span> (job changes) · <span className="font-medium">Real-Time Events Search API</span> (concerts, sports, conferences)
          </p>
        </div>

        {/* Financial Modeling Prep — account financials */}
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-emerald-50 rounded-xl p-2">
              <LineChart size={16} className="text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900 flex items-center gap-2">
                Financial data
                {keys.fmp && <span className="badge bg-emerald-100 text-emerald-700">Connected</span>}
              </p>
              <p className="text-xs text-gray-500">Market cap, P/E, EPS &amp; earnings on the Accounts one-pager (Financial Modeling Prep).</p>
            </div>
            <a href="https://site.financialmodelingprep.com/register" target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-brand-500 hover:underline whitespace-nowrap">Get free key →</a>
          </div>
          <div className="flex items-center gap-2">
            <KeyRound size={13} className="text-gray-400 flex-shrink-0" />
            <input
              className="input"
              type="password"
              placeholder="Optional — FMP API key"
              value={keys.fmp}
              onChange={(e) => setKeys((k) => ({ ...k, fmp: e.target.value }))}
            />
          </div>
        </div>

        {/* Anthropic — voice note summarization */}
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-brand-50 rounded-xl p-2">
              <Sparkles size={16} className="text-brand-600" />
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900 flex items-center gap-2">
                Anthropic (Claude)
                {keys.anthropic && <span className="badge bg-emerald-100 text-emerald-700">Connected</span>}
              </p>
              <p className="text-xs text-gray-500">Powers voice-note summaries, briefings, activity digests, and Playbook synthesis.</p>
            </div>
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-brand-500 hover:underline whitespace-nowrap">Get key →</a>
          </div>
          <div className="flex items-center gap-2">
            <KeyRound size={13} className="text-gray-400 flex-shrink-0" />
            <input
              className="input"
              type="password"
              placeholder="sk-ant-…"
              value={keys.anthropic}
              onChange={(e) => setKeys((k) => ({ ...k, anthropic: e.target.value }))}
            />
            <button
              type="button"
              onClick={testAnthropicKey}
              disabled={testingKey || !keys.anthropic.trim()}
              className="btn-ghost text-sm border border-gray-200 flex-shrink-0 disabled:opacity-50"
            >
              {testingKey ? 'Testing…' : 'Test'}
            </button>
          </div>
          {keyTest && (
            <p className={`text-xs mt-2 ${keyTest.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {keyTest.ok ? '✓ ' : '✕ '}{keyTest.msg}
            </p>
          )}

          {/* Model picker */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-700 mb-2">AI model — quality vs. cost</p>
            <div className="space-y-1.5">
              {AI_MODELS.map((m) => (
                <label
                  key={m.id}
                  className={`flex items-start gap-2.5 p-2.5 rounded-xl cursor-pointer border transition-colors ${aiModel === m.id ? 'border-brand-300 bg-brand-50/50' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  <input
                    type="radio"
                    name="aimodel"
                    checked={aiModel === m.id}
                    onChange={() => setAiModelState(m.id)}
                    className="mt-0.5 accent-brand-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{m.label}</p>
                    <p className="text-xs text-gray-500">{m.blurb}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-3">
            Without a key, AI features fall back gracefully (raw transcripts, heuristic suggestions, the built-in conference catalog). The model choice applies once a key is set.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary flex items-center gap-1.5">
            {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
            {saved ? 'Saved!' : 'Save API keys'}
          </button>
          <p className="text-xs text-gray-400">Stored locally, never sent to any server.</p>
        </div>
      </form>

      <div className="mt-8 p-4 bg-gray-50 rounded-2xl border border-gray-100">
        <p className="text-xs font-semibold text-gray-700 mb-2">Why these APIs?</p>
        <ul className="text-xs text-gray-500 space-y-1.5">
          <li><span className="font-medium text-gray-700">Open-Meteo</span> — weather works out of the box, no key or signup. Checks each contact's city for storms, extreme temps, and high winds.</li>
          <li><span className="font-medium text-gray-700">GDELT</span> — company news works out of the box, no key. Scans global news for each company name, last 7 days. Optional NewsAPI key upgrades headline quality.</li>
          <li><span className="font-medium text-gray-700">RapidAPI</span> — one key covers both LinkedIn job-change detection (Fresh LinkedIn Profile Data) and local events (Real-Time Events Search). Subscribe to those two APIs in your RapidAPI dashboard.</li>
        </ul>
      </div>
    </div>
  )
}
