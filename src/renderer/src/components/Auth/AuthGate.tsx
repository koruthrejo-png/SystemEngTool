import { useEffect, useState } from 'react'
import { useStore } from '../../store'
import { Button, Input } from '../ui'

type Mode = 'signin' | 'signup' | 'forgot'

/**
 * Sign in once, then offline forever. The gate reads the cached session through
 * loadSession() — main reads it off disk with no network call — so a signed-in user opens
 * the app at the same speed on a plane as on a desk.
 */
export default function AuthGate({ children }: { children: React.ReactNode }): JSX.Element {
  const { session, sessionLoaded, signUpPending, loadSession, signIn, signUp, resetPassword, clearSignUpPending, lastError, clearError } = useStore()
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  // loadSession is plain async (not wrapped in the store's run()), so swallow the rejection
  // here rather than let it escape as an unhandled promise rejection. The store's `finally`
  // flips sessionLoaded either way, so a failure falls through to the sign-in form instead
  // of spinning forever.
  useEffect(() => { loadSession().catch(() => {}) }, [])

  if (!sessionLoaded) return <div className="min-h-screen grid place-items-center text-ink-faint">Loading…</div>
  if (session) return <>{children}</>

  function go(next: Mode): void {
    clearError()
    setResetSent(false)
    clearSignUpPending()
    setMode(next)
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    clearError()
    setBusy(true)
    try {
      if (mode === 'signin') await signIn({ email, password })
      else if (mode === 'signup') await signUp({ email, password, displayName: name })
      else { await resetPassword(email); setResetSent(true) }
    } finally {
      setBusy(false)
      setPassword('')
    }
  }

  const confirmation = signUpPending
    ? 'Check your email — click the link we sent to activate your account, then sign in.'
    : resetSent
      ? 'Check your email for a link to set a new password.'
      : null

  return (
    <div className="min-h-screen grid place-items-center bg-navy">
      <div className="w-[380px] rounded-xl bg-white p-8 shadow-lg">
        <h1 className="text-lg font-semibold text-ink mb-1">ReqArch Suite</h1>
        <p className="text-sm text-ink-faint mb-5">
          {mode === 'signin' ? 'Sign in to continue.' : mode === 'signup' ? 'Create your account.' : 'Reset your password.'}
        </p>

        {confirmation ? (
          <>
            <p className="text-sm text-ink mb-5">{confirmation}</p>
            <Button onClick={() => go('signin')}>Back to sign in</Button>
          </>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            {mode === 'signup' && (
              <label className="text-sm text-ink-faint">Name
                <Input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
            )}
            <label className="text-sm text-ink-faint">Email
              <Input aria-label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            {mode !== 'forgot' && (
              <label className="text-sm text-ink-faint">Password
                <Input
                  aria-label="Password" type="password" value={password}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  onChange={(e) => setPassword(e.target.value)} required minLength={8}
                />
              </label>
            )}
            {lastError && <p className="text-sm text-error">{lastError}</p>}
            <Button type="submit" disabled={busy}>
              {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
            </Button>
          </form>
        )}

        {!confirmation && (
          <div className="mt-4 flex justify-between text-sm">
            {mode === 'signin' ? (
              <>
                <button type="button" className="text-action hover:underline" onClick={() => go('forgot')}>Forgot password?</button>
                <span className="text-ink-faint">No account? <button type="button" className="text-action hover:underline" onClick={() => go('signup')}>Create one</button></span>
              </>
            ) : (
              <button type="button" className="text-action hover:underline" onClick={() => go('signin')}>Back to sign in</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
