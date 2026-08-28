import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://nrhtzksmsatoznytgjxq.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_vkAzWwR7yTsxYDBpW6gVyQ_277yMIvF'

const title = document.getElementById('title')
const body = document.getElementById('body')
// Supabase appends its result to the URL fragment, e.g. #access_token=…&type=recovery
const params = new URLSearchParams(location.hash.slice(1))
const type = params.get('type')

/**
 * Everything in the fragment is attacker-supplied: anyone can hand out a link to this page
 * with any hash they like, on the very domain the confirmation email teaches users to
 * trust. So values from it are only ever written as text, never as markup — otherwise a
 * crafted link could render a fake "re-enter your password" form here and harvest it.
 */
function paragraph(text, className = 'msg') {
  const p = document.createElement('p')
  p.className = className
  p.textContent = text
  return p
}

const errorDescription = params.get('error_description')

if (errorDescription) {
  title.textContent = 'Link problem'
  body.replaceChildren(
    paragraph(errorDescription, 'msg err'),
    paragraph('Request a new email from ReqArch and try again.')
  )
} else if (type === 'recovery') {
  title.textContent = 'Set a new password'

  const input = document.createElement('input')
  input.id = 'pw'
  input.type = 'password'
  input.placeholder = 'New password'
  input.autocomplete = 'new-password'

  const button = document.createElement('button')
  button.id = 'go'
  button.textContent = 'Update password'

  const out = paragraph('')
  out.id = 'out'
  body.replaceChildren(input, button, out)

  // detectSessionInUrl picks the recovery token out of the fragment for us.
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { detectSessionInUrl: true, persistSession: false }
  })

  button.onclick = async () => {
    const password = input.value
    if (password.length < 8) {
      out.className = 'msg err'
      out.textContent = 'Use at least 8 characters.'
      return
    }
    const { error } = await supabase.auth.updateUser({ password })
    out.className = error ? 'msg err' : 'msg ok'
    out.textContent = error ? error.message : 'Password updated. Return to ReqArch and sign in.'
  }
} else if (type === 'signup' || type === 'magiclink' || type === 'email_change') {
  title.textContent = 'Email confirmed'
  body.replaceChildren(paragraph('Your ReqArch account is active. Return to the app and sign in.', 'msg ok'))
} else {
  title.textContent = 'ReqArch'
  body.replaceChildren(paragraph(
    'This page handles account confirmation and password resets for the ReqArch desktop app. Open it from the link in your email.'
  ))
}
