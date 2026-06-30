import { useState } from 'react'
import { Loader2, Sparkles, ClipboardPaste, ChevronDown, ChevronUp } from 'lucide-react'
import { Contact } from '../types'
import { createContact, updateContact } from '../lib/storage'
import { fetchLinkedInProfile } from '../lib/analytics'
import { parseEmailSignature } from '../lib/importContacts'
import Modal from '../components/Modal'

interface Props {
  contact?: Contact
  onClose: () => void
  onSaved: () => void
}

type FormData = Omit<Contact, 'id' | 'created_at' | 'updated_at' | 'tags' | 'tier'> & { tags: string; tier: string }

// ── Free auto-fill helpers (no API key required) ──────────────────────────────

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

function parseNameFromLinkedIn(url: string): { first_name?: string; last_name?: string } {
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/)
  if (!match) return {}
  // LinkedIn slugs: "john-smith" or "john-smith-ab12cd" (trailing hash suffix)
  const slug = match[1].replace(/-[a-f0-9]{6,}$/i, '').replace(/-\d+$/, '')
  const parts = slug.split('-').filter(Boolean)
  if (parts.length === 0) return {}
  return {
    first_name: capitalize(parts[0]),
    last_name: parts.length > 1 ? parts.slice(1).map(capitalize).join(' ') : undefined,
  }
}

const GENERIC_DOMAINS = new Set([
  'gmail.com','yahoo.com','outlook.com','hotmail.com','icloud.com',
  'me.com','aol.com','protonmail.com','live.com','msn.com',
])

function companyFromEmail(email: string): string | undefined {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain || GENERIC_DOMAINS.has(domain)) return undefined
  const name = domain.split('.')[0]
  if (!name) return undefined
  // Short names (≤4 chars) are likely acronyms — uppercase them
  return name.length <= 4 ? name.toUpperCase() : capitalize(name)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ContactForm({ contact, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormData>({
    first_name: contact?.first_name ?? '',
    last_name: contact?.last_name ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    company: contact?.company ?? '',
    title: contact?.title ?? '',
    city: contact?.city ?? '',
    state: contact?.state ?? '',
    country: contact?.country ?? '',
    birthday: contact?.birthday ?? '',
    linkedin_url: contact?.linkedin_url ?? '',
    notes: contact?.notes ?? '',
    last_contacted: contact?.last_contacted ?? '',
    tier: contact?.tier ?? 'standard',
    ticker: contact?.ticker ?? '',
    tags: contact?.tags?.join(', ') ?? '',
  })
  const [fetching, setFetching] = useState(false)
  const [fillStatus, setFillStatus] = useState<'idle' | 'filled' | 'error'>('idle')
  const [showSigPaste, setShowSigPaste] = useState(false)
  const [sigText, setSigText] = useState('')

  function set(field: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function applyFill(patch: Partial<FormData>) {
    setForm((f) => {
      const next = { ...f }
      for (const [k, v] of Object.entries(patch)) {
        const key = k as keyof FormData
        if (v && !f[key]) (next as Record<string, string>)[key] = v as string
      }
      return next
    })
  }

  function handleSigChange(text: string) {
    setSigText(text)
    if (text.length < 10) return
    const parsed = parseEmailSignature(text)
    if (Object.keys(parsed).length > 0) {
      applyFill(parsed as Partial<FormData>)
      setFillStatus('filled')
    }
  }

  async function lookupLinkedIn(url: string) {
    if (!url.includes('linkedin.com/in/')) return

    // Free: parse the name from the URL slug right away
    const parsed = parseNameFromLinkedIn(url)
    if (parsed.first_name || parsed.last_name) {
      applyFill(parsed)
      setFillStatus('filled')
    }

    // RapidAPI: pull the full profile (title, company, location, headline, photo, email-if-public)
    const rapidKey = localStorage.getItem('apikey_rapidapi')
    if (!rapidKey) return
    setFetching(true)
    const profile = await fetchLinkedInProfile(url)
    setFetching(false)
    if (!profile) { setFillStatus('error'); return }
    applyFill({
      first_name: profile.first_name,
      last_name: profile.last_name,
      title: profile.title ?? profile.headline,
      company: profile.company,
      city: profile.city,
      country: profile.country,
      email: profile.email,
      avatar_url: profile.photo_url,
    })
    setFillStatus('filled')
  }

  function handleEmailBlur(email: string) {
    if (!email.includes('@')) return
    const company = companyFromEmail(email)
    if (company) applyFill({ company })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const data = {
      ...form,
      tier: (form.tier || 'standard') as Contact['tier'],
      ticker: form.ticker?.trim().toUpperCase() || undefined,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    }
    if (contact) await updateContact(contact.id, data)
    else await createContact(data)
    onSaved()
  }

  return (
    <Modal title={contact ? 'Edit Contact' : 'New Contact'} onClose={onClose} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Email signature paste */}
        <div className="rounded-xl border border-dashed border-gray-200 overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
            onClick={() => setShowSigPaste((v) => !v)}
          >
            <ClipboardPaste size={13} className="text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-500 flex-1">Paste an email signature to auto-fill</span>
            {showSigPaste ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
          </button>
          {showSigPaste && (
            <div className="px-3 pb-3 border-t border-dashed border-gray-200">
              <textarea
                className="input mt-2 text-xs min-h-[90px] resize-y font-mono"
                placeholder={"John Smith\nVP of Sales, Acme Corp\njohn@acme.com\n+1 (312) 555-0100\nlinkedin.com/in/johnsmith"}
                value={sigText}
                onChange={(e) => handleSigChange(e.target.value)}
                autoFocus
              />
              <p className="text-[11px] text-gray-400 mt-1">Fields auto-fill as you paste — only empty fields are updated.</p>
            </div>
          )}
        </div>

        {/* LinkedIn — first so auto-fill populates fields below */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">LinkedIn URL</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="url"
                className="input pr-9"
                value={form.linkedin_url}
                onChange={(e) => set('linkedin_url', e.target.value)}
                onBlur={(e) => lookupLinkedIn(e.target.value)}
                placeholder="https://linkedin.com/in/…"
              />
              {fetching && (
                <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
              )}
            </div>
            <button
              type="button"
              className="btn-ghost border border-gray-200 text-sm flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50"
              onClick={() => lookupLinkedIn(form.linkedin_url ?? '')}
              disabled={fetching || !(form.linkedin_url ?? '').includes('linkedin.com/in/')}
            >
              {fetching ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} className="text-gold-500" />}
              Look up
            </button>
          </div>
          {fillStatus === 'filled' && (
            <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
              <Sparkles size={11} /> Filled from LinkedIn — review and adjust below.
            </p>
          )}
          {fillStatus === 'error' && (
            <p className="text-[11px] text-red-500 mt-1">Couldn't fetch the profile — check your RapidAPI key in Settings (filled name from the URL).</p>
          )}
          <p className="text-[11px] text-gray-400 mt-1">
            Pulls name, title, company, location & photo. Email usually isn't public on LinkedIn — add that manually.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">First name *</label>
            <input required className="input" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Last name *</label>
            <input required className="input" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Company</label>
            <input className="input" value={form.company} onChange={(e) => set('company', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
            <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              onBlur={(e) => handleEmailBlur(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
            <input type="tel" className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">City</label>
            <input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">State</label>
            <input className="input" value={form.state} onChange={(e) => set('state', e.target.value)} placeholder="MN" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Country</label>
            <input className="input" value={form.country} onChange={(e) => set('country', e.target.value)} placeholder="US" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Birthday</label>
            <input type="date" className="input" value={form.birthday} onChange={(e) => set('birthday', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Last contacted</label>
            <input type="date" className="input" value={form.last_contacted} onChange={(e) => set('last_contacted', e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Relationship tier</label>
            <select className="input" value={form.tier} onChange={(e) => set('tier', e.target.value)}>
              <option value="key">Key account — check in every 2 weeks</option>
              <option value="standard">Standard — check in monthly</option>
              <option value="low">Low touch — check in quarterly</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Stock ticker <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              className="input uppercase"
              value={form.ticker}
              onChange={(e) => set('ticker', e.target.value.toUpperCase())}
              placeholder="RGA, MSFT, AAPL…"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
          <input className="input" value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="enterprise, key account, finance" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Quick notes</label>
          <textarea
            className="input min-h-[80px] resize-y"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Personal details, preferences, family info…"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary">
            {contact ? 'Save changes' : 'Add contact'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
