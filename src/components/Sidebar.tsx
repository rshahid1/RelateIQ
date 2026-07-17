import { NavLink } from 'react-router-dom'
import { Users, Calendar, Bell, StickyNote, BarChart2, Settings, Zap, Lightbulb, LogOut, Building2, Target } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const links = [
  { to: '/accounts', icon: Building2, label: 'Accounts' },
  { to: '/contacts', icon: Users, label: 'Contacts' },
  { to: '/prospects', icon: Target, label: 'Prospects' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/alerts', icon: Bell, label: 'Alerts' },
  { to: '/notes', icon: StickyNote, label: 'Notes' },
  { to: '/playbook', icon: Lightbulb, label: 'Playbook' },
  { to: '/analytics', icon: BarChart2, label: 'Analytics' },
]

export default function Sidebar({ alertCount }: { alertCount: number }) {
  const { user, logout } = useAuth()
  return (
    <aside className="hidden md:flex flex-col w-56 min-h-screen bg-white border-r border-gray-100 py-6 px-3 fixed left-0 top-0 bottom-0 z-10">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 mb-8">
        <div className="bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl p-2 shadow-sm ring-1 ring-gold-400/30">
          <Zap size={16} className="text-gold-200" />
        </div>
        <span className="font-display font-semibold text-gray-900 text-base tracking-tight">RelateIQ</span>
      </div>

      <nav className="flex flex-col gap-0.5 flex-1">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors relative ${
                isActive
                  ? 'bg-brand-50 text-brand-600'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`
            }
          >
            <Icon size={16} />
            {label}
            {label === 'Alerts' && alertCount > 0 && (
              <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <NavLink
        to="/settings"
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            isActive ? 'bg-brand-50 text-brand-600' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`
        }
      >
        <Settings size={16} />
        Settings
      </NavLink>

      <button
        onClick={logout}
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors w-full text-left"
        title={user?.email ?? undefined}
      >
        <LogOut size={16} />
        <span className="truncate">Log out</span>
      </button>
    </aside>
  )
}
