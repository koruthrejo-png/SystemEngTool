import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AuthGate from './AuthGate'
import { useStore } from '../../store'

const USER = { id: 'sb-user-123', email: 'v@example.com', displayName: 'Verified Name' }

function stubApi(over: Record<string, any> = {}): void {
  ;(window as any).api = {
    ...(window as any).api,
    auth: {
      getSession: vi.fn().mockResolvedValue(null),
      signIn: vi.fn().mockResolvedValue(USER),
      signUp: vi.fn().mockResolvedValue({ status: 'confirm-email' }),
      signOut: vi.fn().mockResolvedValue(undefined),
      resetPassword: vi.fn().mockResolvedValue(undefined),
      ...over
    },
    users: { me: vi.fn().mockResolvedValue(null), list: vi.fn().mockResolvedValue([]) }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({ session: null, sessionLoaded: false, signUpPending: false, lastError: null })
  stubApi()
})

describe('AuthGate', () => {
  it('shows the sign-in form when there is no session', async () => {
    render(<AuthGate><div>THE APP</div></AuthGate>)
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument())
    expect(screen.queryByText('THE APP')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('renders the loading state, not the form, until the session has loaded', async () => {
    render(<AuthGate><div>THE APP</div></AuthGate>)
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(screen.queryByText('THE APP')).not.toBeInTheDocument()
    // flush the pending loadSession so the state update lands inside the test
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument())
  })

  it('renders the app when a cached session exists', async () => {
    stubApi({ getSession: vi.fn().mockResolvedValue(USER) })
    render(<AuthGate><div>THE APP</div></AuthGate>)
    await waitFor(() => expect(screen.getByText('THE APP')).toBeInTheDocument())
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })

  it('falls through to the form when loadSession rejects', async () => {
    stubApi({ getSession: vi.fn().mockRejectedValue(new Error('ipc exploded')) })
    render(<AuthGate><div>THE APP</div></AuthGate>)
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument())
    expect(screen.queryByText('THE APP')).not.toBeInTheDocument()
  })

  it('signing in swaps the form for the app', async () => {
    render(<AuthGate><div>THE APP</div></AuthGate>)
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'v@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter22' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByText('THE APP')).toBeInTheDocument())
    expect((window as any).api.auth.signIn).toHaveBeenCalledWith({ email: 'v@example.com', password: 'hunter22' })
  })

  it('signing up lands on "check your email", not in the app', async () => {
    render(<AuthGate><div>THE APP</div></AuthGate>)
    await waitFor(() => expect(screen.getByText('Create one')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Create one'))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Verified Name' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'v@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter22' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(screen.getByText(/Check your email/i)).toBeInTheDocument())
    expect(screen.queryByText('THE APP')).not.toBeInTheDocument()
  })

  it('a failed sign-in shows the error and keeps you on the form', async () => {
    stubApi({ signIn: vi.fn().mockRejectedValue(new Error('Invalid login credentials')) })
    render(<AuthGate><div>THE APP</div></AuthGate>)
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'v@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrongpassword' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByText('Invalid login credentials')).toBeInTheDocument())
    expect(screen.queryByText('THE APP')).not.toBeInTheDocument()
  })

  it('forgot password sends a reset email', async () => {
    render(<AuthGate><div>THE APP</div></AuthGate>)
    await waitFor(() => expect(screen.getByText('Forgot password?')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Forgot password?'))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'v@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    await waitFor(() => expect((window as any).api.auth.resetPassword).toHaveBeenCalledWith('v@example.com'))
    expect(screen.getByText(/Check your email/i)).toBeInTheDocument()
  })
})
