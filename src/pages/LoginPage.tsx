import { useState } from 'react'
import { Zap, Mail, Lock, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const started = await signup(email, password)
        if (!started) {
          setInfo('Check your email to confirm your account, then log in.')
          setMode('login')
        }
      } else {
        await login(email, password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl p-2.5 ring-1 ring-gold-400/30">
            <Zap size={22} className="text-gold-200" />
          </div>
          <span className="font-display font-semibold text-gray-900 text-xl tracking-tight">RelateIQ</span>
        </div>

        <div className="card !p-7">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {mode === 'login'
              ? 'Log in to access your relationships.'
              : 'Your data is private to your account and synced across your devices.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  required
                  type="email"
                  className="input pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  required
                  type="password"
                  className="input pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  minLength={mode === 'signup' ? 6 : undefined}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2.5">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}
            {info && (
              <div className="flex items-start gap-2 text-sm text-brand-700 bg-brand-50 rounded-lg px-3 py-2.5">
                <CheckCircle2 size={15} className="flex-shrink-0 mt-0.5" />
                {info}
              </div>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full py-2.5 disabled:opacity-60">
              {busy ? 'One moment…' : mode === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-5">
          {mode === 'login' ? (
            <>New here?{' '}
              <button className="text-brand-600 font-medium hover:underline" onClick={() => { setMode('signup'); setError(''); setInfo('') }}>
                Create an account
              </button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button className="text-brand-600 font-medium hover:underline" onClick={() => { setMode('login'); setError(''); setInfo('') }}>
                Log in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
