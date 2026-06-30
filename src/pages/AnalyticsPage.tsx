import { useMemo } from 'react'
import { Contact, MeetingNote, LifeEvent } from '../types'
import { differenceInDays, parseISO, format, subDays } from 'date-fns'
import { Users, Clock, TrendingUp, Cake, MapPin, Building2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import Avatar from '../components/Avatar'

interface Props {
  contacts: Contact[]
  notes: MeetingNote[]
  events: LifeEvent[]
}

export default function AnalyticsPage({ contacts, notes, events }: Props) {
  const stats = useMemo(() => {
    const now = new Date()

    const overdueContacts = contacts.filter((c) => {
      if (!c.last_contacted) return true
      return differenceInDays(now, parseISO(c.last_contacted)) > 60
    })

    const recentlyContacted = contacts.filter((c) => {
      if (!c.last_contacted) return false
      return differenceInDays(now, parseISO(c.last_contacted)) <= 14
    })

    const upcomingBirthdays = contacts
      .filter((c) => {
        if (!c.birthday) return false
        const base = parseISO(c.birthday)
        const next = new Date(now.getFullYear(), base.getMonth(), base.getDate())
        if (next < now) next.setFullYear(now.getFullYear() + 1)
        return differenceInDays(next, now) <= 30
      })
      .map((c) => {
        const base = parseISO(c.birthday!)
        const next = new Date(now.getFullYear(), base.getMonth(), base.getDate())
        if (next < now) next.setFullYear(now.getFullYear() + 1)
        return { contact: c, days: differenceInDays(next, now), date: next }
      })
      .sort((a, b) => a.days - b.days)

    const byCity = groupBy(contacts.filter((c) => c.city), (c) => c.city!)
    const byCompany = groupBy(contacts.filter((c) => c.company), (c) => c.company!)

    const activityByWeek = Array.from({ length: 8 }, (_, i) => {
      const weekEnd = subDays(now, i * 7)
      const weekStart = subDays(weekEnd, 7)
      const count = notes.filter((n) => {
        const d = parseISO(n.meeting_date)
        return d >= weekStart && d < weekEnd
      }).length
      return { label: format(weekStart, 'MMM d'), count }
    }).reverse()

    const maxActivity = Math.max(...activityByWeek.map((w) => w.count), 1)

    return { overdueContacts, recentlyContacted, upcomingBirthdays, byCity, byCompany, activityByWeek, maxActivity }
  }, [contacts, notes])

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Analytics</h1>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Users} label="Total Contacts" value={contacts.length} color="text-brand-600" bg="bg-brand-50" />
        <StatCard icon={TrendingUp} label="Active (14d)" value={stats.recentlyContacted.length} color="text-emerald-600" bg="bg-emerald-50" />
        <StatCard icon={Clock} label="Overdue (60d+)" value={stats.overdueContacts.length} color="text-orange-600" bg="bg-orange-50" />
        <StatCard icon={Cake} label="Birthdays (30d)" value={stats.upcomingBirthdays.length} color="text-pink-600" bg="bg-pink-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Activity chart */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Meeting activity (8 weeks)</h3>
          <div className="flex items-end gap-2 h-32">
            {stats.activityByWeek.map((w) => (
              <div key={w.label} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-brand-500 rounded-t-md transition-all"
                  style={{ height: `${(w.count / stats.maxActivity) * 100}%`, minHeight: w.count > 0 ? 4 : 0 }}
                />
                <span className="text-[10px] text-gray-400 -rotate-45 origin-top-left translate-y-2">{w.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Overdue contacts */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock size={15} className="text-orange-500" />
            Needs attention
          </h3>
          {stats.overdueContacts.length === 0 ? (
            <p className="text-sm text-gray-400">All contacts are up to date. 🎉</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {stats.overdueContacts.slice(0, 8).map((c) => (
                <Link key={c.id} to={`/contacts/${c.id}`} className="flex items-center gap-2 hover:bg-gray-50 -mx-1 px-1 py-1 rounded-lg transition-colors">
                  <Avatar name={`${c.first_name} ${c.last_name}`} size="sm" url={c.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.first_name} {c.last_name}</p>
                    <p className="text-xs text-gray-400 truncate">{c.company}</p>
                  </div>
                  <span className="text-xs text-orange-500 flex-shrink-0">
                    {c.last_contacted
                      ? `${differenceInDays(new Date(), parseISO(c.last_contacted))}d ago`
                      : 'never'}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming birthdays */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Cake size={15} className="text-pink-500" />
            Upcoming birthdays
          </h3>
          {stats.upcomingBirthdays.length === 0 ? (
            <p className="text-sm text-gray-400">No birthdays in the next 30 days.</p>
          ) : (
            <div className="space-y-2">
              {stats.upcomingBirthdays.map(({ contact: c, days, date }) => (
                <Link key={c.id} to={`/contacts/${c.id}`} className="flex items-center gap-2 hover:bg-gray-50 -mx-1 px-1 py-1 rounded-lg transition-colors">
                  <Avatar name={`${c.first_name} ${c.last_name}`} size="sm" url={c.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{c.first_name}</p>
                    <p className="text-xs text-gray-400">{format(date, 'MMM d')}</p>
                  </div>
                  <span className={`text-xs font-medium ${days <= 3 ? 'text-pink-600' : 'text-gray-400'}`}>
                    {days === 0 ? 'Today!' : `${days}d`}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* By city */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin size={15} className="text-brand-500" />
            Contacts by city
          </h3>
          <div className="space-y-2">
            {Object.entries(stats.byCity)
              .sort((a, b) => b[1].length - a[1].length)
              .slice(0, 8)
              .map(([city, cs]) => (
                <div key={city} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-gray-700 truncate">{city}</span>
                  <div className="flex items-center gap-2">
                    <div className="bg-brand-100 rounded-full h-1.5" style={{ width: `${(cs.length / contacts.length) * 80 + 16}px` }} />
                    <span className="text-xs text-gray-500 w-4 text-right">{cs.length}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* By company */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Building2 size={15} className="text-brand-500" />
            Contacts by company
          </h3>
          <div className="space-y-2">
            {Object.entries(stats.byCompany)
              .sort((a, b) => b[1].length - a[1].length)
              .slice(0, 8)
              .map(([company, cs]) => (
                <div key={company} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-gray-700 truncate">{company}</span>
                  <div className="flex items-center gap-2">
                    <div className="bg-emerald-100 rounded-full h-1.5" style={{ width: `${(cs.length / contacts.length) * 80 + 16}px` }} />
                    <span className="text-xs text-gray-500 w-4 text-right">{cs.length}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color, bg }: { icon: React.ElementType; label: string; value: number; color: string; bg: string }) {
  return (
    <div className="card">
      <div className={`inline-flex p-2 rounded-xl mb-3 ${bg}`}>
        <Icon size={18} className={color} />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item)
    if (!acc[k]) acc[k] = []
    acc[k].push(item)
    return acc
  }, {} as Record<string, T[]>)
}
