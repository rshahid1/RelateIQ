/**
 * Google Sign-In via Google Identity Services (GIS).
 *
 * Requires a free OAuth Client ID from console.cloud.google.com
 * (APIs & Services → Credentials → Create OAuth client ID → Web application,
 * with http://localhost:5173 added to Authorized JavaScript origins).
 *
 * The ID token is delivered directly by Google's SDK over HTTPS, so for a
 * client-only app we decode its payload without a server round-trip.
 */

export interface GoogleProfile {
  sub: string      // stable Google user id
  email: string
  name: string
  picture?: string
}

const CLIENT_ID_KEY = 'rma_google_client_id'

export function getGoogleClientId(): string {
  return localStorage.getItem(CLIENT_ID_KEY) || import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
}

export function setGoogleClientId(id: string) {
  if (id.trim()) localStorage.setItem(CLIENT_ID_KEY, id.trim())
  else localStorage.removeItem(CLIENT_ID_KEY)
}

let gsiLoaded: Promise<void> | null = null

function loadGsiScript(): Promise<void> {
  if (gsiLoaded) return gsiLoaded
  gsiLoaded = new Promise((resolve, reject) => {
    if (document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Sign-In'))
    document.head.appendChild(script)
  })
  return gsiLoaded
}

function decodeIdToken(token: string): GoogleProfile {
  const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  const data = JSON.parse(atob(payload))
  return { sub: data.sub, email: data.email, name: data.name ?? data.email, picture: data.picture }
}

/**
 * Render the official Google button into `container`.
 * Returns false (and renders nothing) when no client ID is configured.
 */
export async function renderGoogleButton(
  container: HTMLElement,
  onProfile: (profile: GoogleProfile) => void,
  onError: (message: string) => void
): Promise<boolean> {
  const clientId = getGoogleClientId()
  if (!clientId) return false

  try {
    await loadGsiScript()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const google = (window as any).google
    google.accounts.id.initialize({
      client_id: clientId,
      callback: (response: { credential?: string }) => {
        try {
          if (!response.credential) throw new Error('No credential returned')
          onProfile(decodeIdToken(response.credential))
        } catch {
          onError('Google sign-in failed. Please try again.')
        }
      },
    })
    google.accounts.id.renderButton(container, {
      theme: 'outline',
      size: 'large',
      width: 320,
      text: 'continue_with',
    })
    return true
  } catch {
    onError('Could not load Google Sign-In.')
    return false
  }
}
