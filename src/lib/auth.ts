/**
 * Local authentication — users stored in localStorage with PBKDF2-hashed
 * passwords (Web Crypto, 150k iterations, per-user random salt).
 *
 * This protects against casual access on a shared machine. For true
 * enterprise security (server-side sessions, encrypted at rest), swap
 * this module for Supabase Auth — the AuthContext API stays the same.
 */

import type { GoogleProfile } from './google'

export interface AuthUser {
  id: string
  name: string
  email: string
  picture?: string
  created_at: string
}

interface StoredUser extends AuthUser {
  salt: string
  hash: string
}

const USERS_KEY = 'rma_users'
const SESSION_KEY = 'rma_session'
const LEGACY_KEYS = ['contacts', 'events', 'notes', 'alerts']

function getUsers(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '[]')
  } catch {
    return []
  }
}

function saveUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

function toAuthUser({ id, name, email, picture, created_at }: StoredUser): AuthUser {
  return { id, name, email, ...(picture ? { picture } : {}), created_at }
}

// ── Password hashing (PBKDF2-SHA256 via Web Crypto) ───────────────────────────

function randomSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
}

async function hashPassword(password: string, saltB64: string): Promise<string> {
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0))
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 150_000, hash: 'SHA-256' },
    keyMaterial, 256
  )
  return btoa(String.fromCharCode(...new Uint8Array(bits)))
}

// ── Signup / Login / Session ──────────────────────────────────────────────────

export async function signup(name: string, email: string, password: string): Promise<AuthUser> {
  const users = getUsers()
  const normalizedEmail = email.trim().toLowerCase()

  if (users.some((u) => u.email === normalizedEmail)) {
    throw new Error('An account with this email already exists.')
  }
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters.')
  }

  const salt = randomSalt()
  const hash = await hashPassword(password, salt)
  const user: StoredUser = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: normalizedEmail,
    salt,
    hash,
    created_at: new Date().toISOString(),
  }

  // First account inherits any pre-auth data (the original demo dataset)
  if (users.length === 0) {
    for (const suffix of LEGACY_KEYS) {
      const legacy = localStorage.getItem(`rma_${suffix}`)
      if (legacy !== null) {
        localStorage.setItem(`rma_${user.id}_${suffix}`, legacy)
        localStorage.removeItem(`rma_${suffix}`)
      }
    }
  }

  saveUsers([...users, user])
  sessionStorage.setItem(SESSION_KEY, user.id)
  return toAuthUser(user)
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const normalizedEmail = email.trim().toLowerCase()
  const user = getUsers().find((u) => u.email === normalizedEmail)
  if (!user) {
    throw new Error('Invalid email or password.')
  }
  const hash = await hashPassword(password, user.salt)
  if (hash !== user.hash) {
    throw new Error('Invalid email or password.')
  }
  sessionStorage.setItem(SESSION_KEY, user.id)
  return toAuthUser(user)
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY)
}

/** Restore the logged-in user for this browser tab, if any. */
export function currentSession(): AuthUser | null {
  const id = sessionStorage.getItem(SESSION_KEY)
  if (!id) return null
  const user = getUsers().find((u) => u.id === id)
  return user ? toAuthUser(user) : null
}

export function hasAnyAccount(): boolean {
  return getUsers().length > 0
}

// ── Google Sign-In ────────────────────────────────────────────────────────────

export async function loginWithGoogle(profile: GoogleProfile): Promise<AuthUser> {
  const googleId = `google_${profile.sub}`
  const users = getUsers()
  let user = users.find((u) => u.id === googleId)

  if (!user) {
    // First account inherits any pre-auth data
    if (users.length === 0) {
      for (const suffix of LEGACY_KEYS) {
        const legacy = localStorage.getItem(`rma_${suffix}`)
        if (legacy !== null) {
          localStorage.setItem(`rma_${googleId}_${suffix}`, legacy)
          localStorage.removeItem(`rma_${suffix}`)
        }
      }
    }
    user = {
      id: googleId,
      name: profile.name,
      email: profile.email,
      picture: profile.picture,
      salt: '',
      hash: '',
      created_at: new Date().toISOString(),
    }
    saveUsers([...users, user])
  }

  sessionStorage.setItem(SESSION_KEY, user.id)
  return toAuthUser(user)
}
