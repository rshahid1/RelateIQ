import { useState, useEffect, useCallback } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import Sidebar from './components/Sidebar'
import DashboardPage from './pages/DashboardPage'
import TodayPage from './pages/TodayPage'
import ContactsPage from './pages/ContactsPage'
import ContactDetailPage from './pages/ContactDetailPage'
import CalendarPage from './pages/CalendarPage'
import AlertsPage from './pages/AlertsPage'
import NotesPage from './pages/NotesPage'
import PlaybookPage from './pages/PlaybookPage'
import AnalyticsPage from './pages/AnalyticsPage'
import SettingsPage from './pages/SettingsPage'
import LoginPage from './pages/LoginPage'
import { useAuth } from './context/AuthContext'
import { getContacts, getEvents, getNotes, getAlerts, saveAlerts } from './lib/storage'
import { legacyContactCount, alreadyMigrated, migrateLocalToCloud } from './lib/migrateLocal'
import {
  generateUpcomingEventAlerts, generateOverdueAlerts,
  fetchWeatherAlerts, fetchCompanyNews, fetchLinkedInChanges, fetchLocalEvents,
  fetchHolidayAlerts, fetchStockAlerts, fetchEarningsAlerts,
  fetchCompanyHeadlines,
} from './lib/analytics'
import { Contact, LifeEvent, MeetingNote, Alert } from './types'

export default function App() {
  const { user, ready } = useAuth()

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={22} className="animate-spin text-brand-500" />
      </div>
    )
  }

  if (!user) return <LoginPage />

  return <Workspace />
}

function Workspace() {
  const { user } = useAuth()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [events, setEvents] = useState<LifeEvent[]>([])
  const [notes, setNotes] = useState<MeetingNote[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [legacyCount, setLegacyCount] = useState(0)
  const [migrating, setMigrating] = useState(false)
  const [migrateMsg, setMigrateMsg] = useState<string | null>(null)

  const reloadAll = useCallback(async () => {
    const [cs, evs, ns] = await Promise.all([getContacts(), getEvents(), getNotes()])
    setContacts(cs)
    setEvents(evs)
    setNotes(ns)
    setAlerts(getAlerts())
  }, [])

  const refreshAlerts = useCallback(async () => {
    setAlertsLoading(true)
    const [cs, evs] = await Promise.all([getContacts(), getEvents()])
    const fresh: Alert[] = [
      ...generateUpcomingEventAlerts(cs, evs),
      ...generateOverdueAlerts(cs),
    ]
    // External APIs — weather + news need no key; the rest activate once keys are set in Settings
    try {
      const [weather, news, linkedin, localEvents, holidays, stocks, earnings] = await Promise.all([
        fetchWeatherAlerts(cs),
        fetchCompanyNews(cs),
        fetchLinkedInChanges(cs),
        fetchLocalEvents(cs),
        fetchHolidayAlerts(cs),
        fetchStockAlerts(cs),
        fetchEarningsAlerts(cs),
      ])
      fresh.push(...weather, ...news, ...linkedin, ...localEvents, ...holidays, ...stocks, ...earnings)
    } catch {
      // ignore network failures
    }
    saveAlerts(fresh)
    setAlerts(getAlerts())
    setAlertsLoading(false)
  }, [])

  useEffect(() => {
    reloadAll()
    refreshAlerts()
    if (!alreadyMigrated()) setLegacyCount(legacyContactCount())
  }, [reloadAll, refreshAlerts])

  async function handleImportLegacy() {
    if (!user) return
    setMigrating(true)
    try {
      const r = await migrateLocalToCloud(user.id)
      await reloadAll()
      refreshAlerts()
      setLegacyCount(0)
      setMigrateMsg(`Imported ${r.contacts} contact${r.contacts === 1 ? '' : 's'}, ${r.notes} note${r.notes === 1 ? '' : 's'}, and ${r.conferences} conference${r.conferences === 1 ? '' : 's'} into your account.`)
    } catch (e) {
      setMigrateMsg(`Import failed: ${e instanceof Error ? e.message : 'unknown error'}. Your local data is untouched — tell support.`)
    }
    setMigrating(false)
  }

  // Client-activity notifications — polls every 30 min, fires browser notifications
  // for new news, stock moves, and earnings across your accounts.
  useEffect(() => {
    const SEEN_KEY = 'rma_local_seen_activity'
    const INIT_KEY = 'rma_local_activity_init'
    const today = () => new Date().toISOString().slice(0, 10)

    async function checkActivity() {
      const cs = await getContacts()
      if (cs.length === 0) return

      const seenSet = new Set<string>(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'))
      const isFirstRun = !localStorage.getItem(INIT_KEY)
      const added: string[] = []

      const fire = (key: string, title: string, body: string) => {
        if (seenSet.has(key)) return
        added.push(key)
        if (!isFirstRun && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body, tag: key, icon: '/favicon.ico' })
        }
      }

      // Company news
      const companies = [...new Set(cs.map((c) => c.company).filter(Boolean) as string[])]
      for (const company of companies) {
        try {
          const headlines = await fetchCompanyHeadlines(company)
          for (const h of headlines) {
            if (h.url) fire(`news_${h.url}`, `📰 ${company} in the news`, h.title)
          }
        } catch { /* skip */ }
      }

      // Stock moves
      try {
        for (const a of await fetchStockAlerts(cs)) {
          fire(`stock_${a.data?.ticker}_${today()}`, `📈 ${a.contact_name}`, a.title)
        }
      } catch { /* skip */ }

      // Earnings
      try {
        for (const a of await fetchEarningsAlerts(cs)) {
          fire(`earn_${a.data?.ticker}_${a.data?.earnings_date}`, `📊 Earnings — ${a.contact_name}`, a.title)
        }
      } catch { /* skip */ }

      localStorage.setItem(SEEN_KEY, JSON.stringify([...seenSet, ...added].slice(-500)))
      localStorage.setItem(INIT_KEY, '1')
    }

    if ('Notification' in window) {
      Notification.requestPermission().then(() => checkActivity())
    } else {
      checkActivity()
    }

    const interval = setInterval(checkActivity, 30 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex min-h-screen">
      <Sidebar alertCount={alerts.length} />

      <main className="flex-1 md:ml-56 p-6 lg:p-8 max-w-screen-xl">
        {legacyCount > 0 && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-gold-200 bg-gold-100/30 px-4 py-3">
            <div className="flex-1 text-sm text-gray-700">
              <span className="font-semibold">{legacyCount} contact{legacyCount === 1 ? '' : 's'}</span> from this device aren't in your cloud account yet.
            </div>
            <button onClick={() => setLegacyCount(0)} className="btn-ghost text-sm" disabled={migrating}>Not now</button>
            <button onClick={handleImportLegacy} className="btn-primary text-sm disabled:opacity-60" disabled={migrating}>
              {migrating ? 'Importing…' : 'Import to my account'}
            </button>
          </div>
        )}
        {migrateMsg && (
          <div className="mb-6 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700 flex items-center justify-between gap-3">
            <span>{migrateMsg}</span>
            <button onClick={() => setMigrateMsg(null)} className="text-brand-600 hover:underline text-xs">Dismiss</button>
          </div>
        )}
        <Routes>
          <Route path="/" element={
            <DashboardPage contacts={contacts} notes={notes} events={events} alerts={alerts} />
          } />
          <Route path="/contacts" element={
            <ContactsPage contacts={contacts} onContactsChange={reloadAll} />
          } />
          <Route path="/today" element={
            <TodayPage contacts={contacts} notes={notes} alerts={alerts} />
          } />
          <Route path="/contacts/:id" element={
            <ContactDetailPage onContactsChange={reloadAll} />
          } />
          <Route path="/calendar" element={
            <CalendarPage contacts={contacts} events={events} />
          } />
          <Route path="/alerts" element={
            <AlertsPage alerts={alerts} onRefresh={refreshAlerts} loading={alertsLoading} />
          } />
          <Route path="/notes" element={
            <NotesPage notes={notes} contacts={contacts} />
          } />
          <Route path="/playbook" element={<PlaybookPage />} />
          <Route path="/analytics" element={
            <AnalyticsPage contacts={contacts} notes={notes} events={events} />
          } />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
