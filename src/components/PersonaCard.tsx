import { useState, useEffect } from 'react'
import { Sparkles, Loader2, Heart, RefreshCw } from 'lucide-react'
import { Contact } from '../types'
import {
  fetchLinkedInDossier, generatePersona, getCachedPersona, setCachedPersona,
} from '../lib/persona'

/** "Get to know them" sidebar card — LinkedIn-grounded personal insights. */
export default function PersonaCard({ contact }: { contact: Contact }) {
  const [text, setText] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const c = getCachedPersona(contact.id)
    setText(c?.text ?? null)
    setUpdatedAt(c?.updatedAt ?? null)
    setStatus('idle')
    setError(null)
  }, [contact.id])

  const hasUrl = !!contact.linkedin_url
  const hasRapid = !!localStorage.getItem('apikey_rapidapi')
  const hasAnthropic = !!localStorage.getItem('apikey_anthropic')

  async function generate() {
    if (!contact.linkedin_url) return
    setStatus('loading')
    setError(null)
    const dossier = await fetchLinkedInDossier(contact.linkedin_url)
    if (!dossier) {
      setStatus('error')
      setError('Could not load their LinkedIn profile. Check the URL and your RapidAPI key.')
      return
    }
    const t = await generatePersona(contact, dossier)
    if (!t) {
      setStatus('error')
      setError('Couldn’t generate insights — verify your Anthropic key in Settings.')
      return
    }
    const now = new Date().toISOString()
    setText(t)
    setUpdatedAt(now)
    setCachedPersona(contact.id, { text: t, updatedAt: now })
    setStatus('idle')
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
          <Heart size={15} className="text-rose-400" /> Get to know {contact.first_name}
        </h2>
        {text && status !== 'loading' && (
          <button onClick={generate} className="btn-ghost p-1.5" title="Refresh insights">
            <RefreshCw size={13} />
          </button>
        )}
      </div>

      {!hasUrl ? (
        <p className="text-sm text-gray-400">Add their LinkedIn URL (Edit contact) to build a personal profile.</p>
      ) : !hasRapid || !hasAnthropic ? (
        <p className="text-sm text-amber-700">Needs your RapidAPI and Anthropic keys in Settings.</p>
      ) : status === 'loading' ? (
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Reading their LinkedIn…
        </p>
      ) : status === 'error' ? (
        <div className="text-sm text-red-600">
          {error} <button onClick={generate} className="underline">Retry</button>
        </div>
      ) : text ? (
        <>
          <div className="space-y-1">{renderPersona(text)}</div>
          {updatedAt && (
            <p className="text-[11px] text-gray-300 mt-3">
              Built {new Date(updatedAt).toLocaleDateString()} · from LinkedIn profile
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-3">
            Build a picture of who {contact.first_name} is — interests, what they value, and natural
            ways to connect — from their LinkedIn profile.
          </p>
          <button onClick={generate} className="btn-primary text-sm w-full flex items-center justify-center gap-1.5">
            <Sparkles size={14} /> Discover who they are
          </button>
        </>
      )}
    </div>
  )
}

function renderPersona(text: string) {
  return text.split('\n').map((line, i) => {
    const t = line.trim().replace(/\*\*/g, '')
    if (!t) return null
    if (t.startsWith('## ')) {
      return <h4 key={i} className="font-semibold text-gray-900 text-xs uppercase tracking-wide mt-3 first:mt-0">{t.slice(3)}</h4>
    }
    if (/^[-*•]\s/.test(t)) {
      return <li key={i} className="text-sm text-gray-700 ml-4 list-disc leading-relaxed">{t.replace(/^[-*•]\s/, '')}</li>
    }
    return <p key={i} className="text-sm text-gray-700 leading-relaxed">{t}</p>
  })
}
