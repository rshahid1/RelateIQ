import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Users, TrendingUp, ChevronRight } from 'lucide-react'
import { Contact } from '../types'

interface Props {
  contacts: Contact[]
}

interface Account {
  company: string
  contacts: Contact[]
  ticker?: string
}

export default function AccountsPage({ contacts }: Props) {
  const accounts = useMemo<Account[]>(() => {
    const map = new Map<string, Contact[]>()
    for (const c of contacts) {
      const co = c.company?.trim()
      if (!co) continue
      if (!map.has(co)) map.set(co, [])
      map.get(co)!.push(c)
    }
    return [...map.entries()]
      .map(([company, list]) => ({
        company,
        contacts: list,
        ticker: list.find((c) => c.ticker)?.ticker,
      }))
      .sort((a, b) => b.contacts.length - a.contacts.length || a.company.localeCompare(b.company))
  }, [contacts])

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <div className="w-10 h-0.5 bg-gold-400 rounded-full mb-3" />
        <h1 className="text-3xl font-semibold text-gray-900 flex items-center gap-2.5">
          <Building2 size={24} className="text-brand-600" /> Accounts
        </h1>
        <p className="text-sm text-gray-500 mt-1.5">
          {accounts.length} {accounts.length === 1 ? 'company' : 'companies'} across your book — open one for a live one-pager.
        </p>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Building2 size={30} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg">No companies yet</p>
          <p className="text-sm mt-1">Add contacts with a company and they'll group into accounts here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {accounts.map((a) => (
            <Link
              key={a.company}
              to={`/accounts/${encodeURIComponent(a.company)}`}
              className="card hover:shadow-lift transition-shadow flex items-center gap-3.5 group"
            >
              <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
                <Building2 size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate group-hover:text-brand-600">{a.company}</p>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><Users size={12} /> {a.contacts.length}</span>
                  {a.ticker && (
                    <span className="flex items-center gap-1 text-emerald-600"><TrendingUp size={12} /> {a.ticker}</span>
                  )}
                </div>
              </div>
              <ChevronRight size={16} className="text-gray-300 group-hover:text-brand-400 flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
