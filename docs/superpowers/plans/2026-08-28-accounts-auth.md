# User Accounts — Supabase Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unverified local `identity.json` uuid with a real, verified account — email + password sign-up/sign-in against Supabase Auth — while keeping the app fully usable offline after the first sign-in.

**Architecture:** `@supabase/supabase-js` lives in the **main process only**; no token ever crosses the IPC boundary. The session is cached in `userData/session.bin`, encrypted with Electron `safeStorage`, via a custom storage adapter handed to `createClient`. The launch path reads that file and never awaits the network. The local `users.uuid` stays the identity key; the Supabase user id lands in `external_id`. Renderer gets an `AuthGate` wrapper and a `session` store slice; project data does not move — `.reqarch` files stay local SQLite documents.

**Tech Stack:** Electron 43 (main + preload + renderer), TypeScript, `@supabase/supabase-js` v2 (new runtime dependency), Electron `safeStorage`, zustand, Vitest, GitHub Pages + Actions.

**Spec:** `docs/superpowers/specs/2026-08-09-accounts-auth-design.md`

## Global Constraints

- **Supabase project:** `nrhtzksmsatoznytgjxq` (eu-west-1), `https://nrhtzksmsatoznytgjxq.supabase.co`.
- **Publishable key (public, ships in the binary):** `sb_publishable_vkAzWwR7yTsxYDBpW6gVyQ_277yMIvF`. The `service_role` key never enters this repo, this app, or any build artifact.
- **Because the shipped key is public, every table ever added to `public` gets RLS enabled, without exception.** v1 adds none.
- **No token, refresh token, or Supabase client crosses IPC.** No IPC return shape may contain `access_token` or `refresh_token`.
- **A failed refresh does NOT sign you out.** The cached session is cleared in exactly two cases: an explicit sign-out, or a server response that actually says the refresh token is dead (`invalid_refresh_token` / `refresh_token_not_found`). Network errors, DNS failures, timeouts, 5xx and "offline" are never grounds for clearing it.
- **The launch path makes no network call.** `auth:getSession` reads the encrypted file and returns; refresh happens fire-and-forget afterwards.
- **`users.uuid` / `identity.json.uuid` is immutable.** The Supabase id goes in `external_id` / `externalId`, never replacing the uuid.
- **Email redirect target:** `https://koruthrejo-png.github.io/SystemEngTool/` (the `auth-web/` static page on GitHub Pages, repo `koruthrejo-png/SystemEngTool`). Do **not** publish Pages from `/docs` — that directory holds internal specs and plans.
- **`@supabase/supabase-js` goes in `dependencies`**, not `devDependencies` — `electron-vite`'s `externalizeDepsPlugin()` externalizes main-process deps, so a devDependency would be missing at runtime in a packaged build.
- Ponytail rules apply: stdlib and existing helpers before new code, no speculative abstraction, mark deliberate shortcuts with a `ponytail:` comment naming the ceiling.
- Test baseline before this work: **519 passed / 1 failed**. The 1 failure is the PRE-EXISTING `src/renderer/src/App.test.tsx` "open" button test — it fails on base, is unrelated, and stays failing. Any *other* failure is yours.

## File Structure

| File | Responsibility |
|---|---|
| `src/main/auth/config.ts` (new) | Project URL, publishable key, email redirect URL. Constants only. |
| `src/main/auth/session.ts` (new) | PURE: `shouldClearSession(err)` + `decodeSession(buf, decrypt)`. No Electron, no network, no fs. |
| `src/main/auth/index.ts` (new) | The supabase client, the `safeStorage` file storage adapter, `signUp`/`signIn`/`signOut`/`getSession`/`resetPassword`/`refreshInBackground`. |
| `src/main/handlers/auth.ts` (new) | Thin IPC registration, matching `handlers/app.ts` + `handlers/users.ts`. |
| `src/main/identity.ts` (modify) | `externalId` on `LocalIdentity`; `external_id` in the roster upsert. |
| `src/types/index.ts` (modify) | `LocalIdentity.externalId`, `UpdateMeInput.externalId`, new `AuthUser`. |
| `src/preload/index.ts`, `src/types/api.d.ts` (modify) | `api.auth.*`. |
| `src/main/index.ts` (modify) | `initAuth` + `registerAuthHandlers` + `refreshInBackground()`. |
| `src/renderer/src/store/index.ts` (modify) | `session` slice + 5 actions through the existing `run()` convention. |
| `src/renderer/src/components/Auth/AuthGate.tsx` (new) | Session-or-form gate wrapping the app shell. |
| `src/renderer/src/App.tsx` (modify) | Wrap in `AuthGate`; Sign out in the avatar menu. |
| `auth-web/index.html` (new) | The static confirmation / password-recovery page. |
| `.github/workflows/pages.yml` (new) | Publishes `auth-web/` to GitHub Pages. |
| `supabase/config.toml`, `supabase/migrations/` (new) | Makes the existing GitHub↔Supabase integration a live pipeline. v1 migration is a documented no-op. |

## Wave / Dependency Map

```
Wave 1:  Task 1 (identity externalId)   Task 2 (pure session+config)   Task 3 (auth-web + Pages + supabase/)
Wave 2:  Task 4 (auth module)                      ← needs 1 + 2
Wave 3:  Task 5 (IPC + preload + types + boot)     ← needs 4
Wave 4:  Task 6 (store slice)                      ← needs 5
Wave 5:  Task 7 (AuthGate + App wiring)            ← needs 6
```

**Controller action between Wave 1 and Wave 2:** run `npm i @supabase/supabase-js` (production dependency) and commit the lockfile. Task 4's implementer must not have to install it.

---

### Task 1: Identity carries the Supabase id

**Files:**
- Modify: `src/types/index.ts:184-193`
- Modify: `src/main/identity.ts` (`getMe`, `setMe`, `currentUserRowId`)
- Test: `src/main/handlers/users.test.ts` (extend the existing `identity + users roster` describe)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface LocalIdentity { uuid: string; displayName: string; email: string | null; externalId: string | null }`
  - `interface UpdateMeInput { displayName?: string; email?: string | null; externalId?: string | null }`
  - `setMe({ externalId })` persists the id; `setMe({ externalId: null })` clears it; `uuid` is never writable.
  - `currentUserRowId(db)` writes `external_id` into the roster row.

**Background the implementer needs:** `external_id` already exists on the `users` table (`src/main/db/migrations.ts:19-23`) and `rowToUser` already reads it (`src/main/handlers/users.ts:9`). **No migration is needed.** `identity.json` lives in an injected directory (`initIdentity(dir)`), which is why these tests can use a temp dir with no Electron.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('identity + users roster', …)` in `src/main/handlers/users.test.ts`:

```ts
  it('stores the Supabase id as externalId without touching the uuid', () => {
    const before = getMe()!
    const after = setMe({ displayName: 'Verified Name', email: 'v@example.com', externalId: 'sb-user-123' })
    expect(after.externalId).toBe('sb-user-123')
    expect(after.uuid).toBe(before.uuid)
    const onDisk = JSON.parse(readFileSync(join(identityDir, 'identity.json'), 'utf8'))
    expect(onDisk.externalId).toBe('sb-user-123')
  })

  it('signing out clears externalId but keeps uuid, name and email', () => {
    const before = setMe({ displayName: 'Verified Name', email: 'v@example.com', externalId: 'sb-user-123' })
    const after = setMe({ externalId: null })
    expect(after.externalId).toBeNull()
    expect(after.uuid).toBe(before.uuid)
    expect(after.displayName).toBe('Verified Name')
    expect(after.email).toBe('v@example.com')
  })

  it('upserts external_id into the roster row', () => {
    setMe({ displayName: 'Verified Name', email: 'v@example.com', externalId: 'sb-user-123' })
    currentUserRowId(getDatabase())
    expect(listUsers()[0].externalId).toBe('sb-user-123')
  })

  it('keeps a roster external_id once set, even after signing out locally', () => {
    setMe({ externalId: 'sb-user-123' })
    currentUserRowId(getDatabase())
    setMe({ externalId: null })
    currentUserRowId(getDatabase())
    expect(listUsers()[0].externalId).toBe('sb-user-123')
  })
```

Note: `currentUserRowId` memoises per-database in a `WeakMap`, and `setMe` clears that map — so the second `currentUserRowId` call in the last test really does re-run the upsert.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/main/handlers/users.test.ts`
Expected: FAIL — `externalId` is not a property of `LocalIdentity` (TS error) / `undefined` at runtime.

- [ ] **Step 3: Add the fields to the types**

In `src/types/index.ts`, replace the `LocalIdentity` and `UpdateMeInput` interfaces:

```ts
export interface LocalIdentity {
  uuid: string
  displayName: string
  email: string | null
  /** The Supabase auth user id once signed in, null when signed out. It never replaces
   *  uuid: uuid is the cross-file identity key, this is what a server reconciles on. */
  externalId: string | null
}

export interface UpdateMeInput {
  displayName?: string
  email?: string | null
  externalId?: string | null
}
```

- [ ] **Step 4: Carry externalId through identity.ts**

In `getMe()`, both the parsed branch and the freshly-minted one:

```ts
    if (parsed.uuid && parsed.displayName) {
      cached = {
        uuid: parsed.uuid, displayName: parsed.displayName,
        email: parsed.email ?? null, externalId: parsed.externalId ?? null
      }
      return cached
    }
  } catch { /* absent or unreadable — fall through and mint */ }
  cached = { uuid: randomUUID(), displayName: defaultName(), email: null, externalId: null }
```

In `setMe()`, add the field to `next`:

```ts
  const next: LocalIdentity = {
    uuid: me.uuid,
    displayName: input.displayName?.trim() || me.displayName,
    email: input.email !== undefined ? (input.email?.trim() || null) : me.email,
    externalId: input.externalId !== undefined ? (input.externalId || null) : me.externalId
  }
```

In `currentUserRowId()`, extend the upsert:

```ts
  db.prepare(`
    INSERT INTO users (uuid, display_name, email, external_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(uuid) DO UPDATE SET
      display_name = excluded.display_name,
      email = excluded.email,
      -- Sticky: signing out on this machine clears the local externalId, but the file's
      -- record that this uuid IS that Supabase account is what a future server reconciles
      -- on. Losing it would fork one human into two rows.
      external_id = COALESCE(excluded.external_id, users.external_id),
      updated_at = excluded.updated_at
  `).run(me.uuid, me.displayName, me.email, me.externalId, ts, ts)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/main/handlers/users.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json`
Expected: clean. (If a renderer file constructs a `LocalIdentity` literal, add `externalId: null` there.)

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/main/identity.ts src/main/handlers/users.test.ts
git commit -m "feat(auth): identity carries externalId; roster upserts external_id"
```

---

### Task 2: Pure session rules — `shouldClearSession` and `decodeSession`

**Files:**
- Create: `src/main/auth/config.ts`
- Create: `src/main/auth/session.ts`
- Test: `src/main/auth/session.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SUPABASE_URL: string`, `SUPABASE_PUBLISHABLE_KEY: string`, `AUTH_REDIRECT_URL: string` from `./config`
  - `shouldClearSession(err: unknown): boolean`
  - `decodeSession(buf: Buffer | null, decrypt: (b: Buffer) => string): string | null`

**Why these are pure:** they must run in the normal Vitest suite, which has no Electron. `decodeSession` takes the decrypt function as an argument precisely so `safeStorage` stays out of this file.

- [ ] **Step 1: Write the failing test**

Create `src/main/auth/session.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { shouldClearSession, decodeSession } from './session'

describe('shouldClearSession — the offline rule', () => {
  it('clears when the server says the refresh token is dead', () => {
    expect(shouldClearSession({ code: 'refresh_token_not_found', status: 400 })).toBe(true)
    expect(shouldClearSession({ message: 'Invalid Refresh Token: Already Used', status: 401 })).toBe(true)
  })

  it('does NOT clear when the request never reached the server', () => {
    expect(shouldClearSession({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' })).toBe(false)
    expect(shouldClearSession(new TypeError('Failed to fetch'))).toBe(false)
    expect(shouldClearSession({ message: 'ETIMEDOUT' })).toBe(false)
    expect(shouldClearSession({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' })).toBe(false)
  })

  it('does NOT clear on a server fault or an unrecognised error', () => {
    expect(shouldClearSession({ status: 500, message: 'internal error' })).toBe(false)
    expect(shouldClearSession({ status: 503, message: 'invalid_refresh_token' })).toBe(false)
    expect(shouldClearSession({ message: 'something else went wrong' })).toBe(false)
    expect(shouldClearSession(null)).toBe(false)
    expect(shouldClearSession('boom')).toBe(false)
  })
})

describe('decodeSession', () => {
  const ok = (b: Buffer): string => b.toString('utf8')
  const boom = (): string => { throw new Error('decrypt failed') }

  it('round-trips a stored session', () => {
    const json = JSON.stringify({ access_token: 'a', user: { id: 'u1' } })
    expect(decodeSession(Buffer.from(json, 'utf8'), ok)).toBe(json)
  })

  it('returns null rather than throwing for an absent, empty, corrupt or undecryptable blob', () => {
    expect(decodeSession(null, ok)).toBeNull()
    expect(decodeSession(Buffer.alloc(0), ok)).toBeNull()
    expect(decodeSession(Buffer.from('{"access_to', 'utf8'), ok)).toBeNull()
    expect(decodeSession(Buffer.from('anything', 'utf8'), boom)).toBeNull()
  })
})
```

Note the `{ status: 503, message: 'invalid_refresh_token' }` case: a 5xx wins over the marker string. A gateway echoing our request body back must not sign anyone out.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/auth/session.test.ts`
Expected: FAIL — `Failed to resolve import "./session"`.

- [ ] **Step 3: Write `config.ts`**

Create `src/main/auth/config.ts`:

```ts
/**
 * Supabase connection constants.
 *
 * SUPABASE_PUBLISHABLE_KEY is a PUBLIC key. It ships inside a desktop binary that anyone
 * can unzip, which is exactly what it is designed for — and exactly why every table ever
 * added to the `public` schema must have RLS enabled, without exception. The service_role
 * key never appears in this repo or any build artifact.
 *
 * ponytail: hardcoded, no env plumbing — there is one project. Add env vars when a second
 * (staging) project exists.
 */
export const SUPABASE_URL = 'https://nrhtzksmsatoznytgjxq.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_vkAzWwR7yTsxYDBpW6gVyQ_277yMIvF'

/** Where Supabase's confirmation and password-recovery emails land: the static auth-web
 *  page on GitHub Pages. Must match the Site URL and the redirect allowlist in the
 *  Supabase dashboard, or the links in those emails are rejected. */
export const AUTH_REDIRECT_URL = 'https://koruthrejo-png.github.io/SystemEngTool/'
```

- [ ] **Step 4: Write `session.ts`**

Create `src/main/auth/session.ts`:

```ts
/** Pure session rules. No Electron, no network, no fs — so they run in the normal suite. */

const DEAD_TOKEN = /invalid[ _]refresh[ _]token|refresh[ _]token[ _]not[ _]found/i

/**
 * Is this error the server actually telling us the refresh token is dead?
 *
 * Only two things ever clear a cached session: an explicit sign-out, and a `true` from
 * here. Everything else — offline, DNS failure, timeout, 5xx, anything unrecognised —
 * leaves the user signed in, because a desktop document editor that ejects you from your
 * own local files on a plane is a broken document editor.
 */
export function shouldClearSession(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: unknown; message?: unknown; status?: unknown; name?: unknown }
  // A fetch that never reached the server can never prove a token dead.
  if (e.name === 'AuthRetryableFetchError' || e.name === 'TypeError') return false
  // A server fault is not a verdict on our credentials.
  if (typeof e.status === 'number' && e.status >= 500) return false
  const text = `${typeof e.code === 'string' ? e.code : ''} ${typeof e.message === 'string' ? e.message : ''}`
  return DEAD_TOKEN.test(text)
}

/**
 * Read a stored session blob back to its JSON text, or null. `decrypt` is injected so this
 * stays free of Electron's safeStorage. Anything unreadable — truncated file, rotated OS
 * key, a copy from another machine — is "no session", never a throw: a corrupt cache must
 * cost you a login, not the launch.
 */
export function decodeSession(buf: Buffer | null, decrypt: (b: Buffer) => string): string | null {
  if (!buf || buf.length === 0) return null
  try {
    const text = decrypt(buf)
    JSON.parse(text) // supabase stores JSON; unparseable means garbage, not a session
    return text
  } catch {
    return null
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/main/auth/session.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/main/auth/config.ts src/main/auth/session.ts src/main/auth/session.test.ts
git commit -m "feat(auth): pure session rules — shouldClearSession + decodeSession"
```

---

### Task 3: Static auth page, GitHub Pages workflow, supabase/ pipeline

**Files:**
- Create: `auth-web/index.html`
- Create: `.github/workflows/pages.yml`
- Create: `supabase/config.toml`
- Create: `supabase/migrations/20260828000000_init.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: the URL `https://koruthrejo-png.github.io/SystemEngTool/`, which `src/main/auth/config.ts` already names as `AUTH_REDIRECT_URL` (Task 2). Do not change that URL without changing both.

**Why this exists:** Supabase's confirmation and recovery emails contain a link that has to land somewhere. Registering a `reqarch://` protocol handler is the plumbing this whole design exists to avoid, so the link lands on one static page instead.

**Hard constraint:** the workflow publishes `auth-web/` explicitly. It must **not** publish from `/docs` — that directory holds internal specs and plans and would become public.

This task has no unit test (static assets + CI config). Verification is the checks in Step 5.

- [ ] **Step 1: Write the static page**

> **CORRECTION (applied in commit `f7cd499`).** The `index.html` below was written as a single file that interpolated `error_description` from the URL fragment into `innerHTML`. That is an XSS hole: the fragment is entirely attacker-controlled, so a crafted link *on the domain the confirmation email teaches users to trust* could execute script and render a fake password prompt. The shipped version instead splits into `auth-web/index.html` + `app.js` + `style.css`, builds the DOM with `createElement`/`replaceChildren` and puts every fragment value through `textContent`, and carries a strict CSP (`default-src 'none'`, no `'unsafe-inline'`, allowing only the jsdelivr module and the Supabase API). **Take the committed files as the source of truth, not the snippet below.** Rule for any future edit here: values from `location.hash` are untrusted input and only ever become text.

Create `auth-web/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ReqArch — Account</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         font: 15px/1.5 -apple-system, Segoe UI, Roboto, sans-serif; background: #f6f7f9; color: #16202c; }
  @media (prefers-color-scheme: dark) { body { background: #10161f; color: #e6edf5; } }
  main { width: min(420px, 90vw); padding: 32px; border-radius: 12px; background: rgba(127,127,127,.08); }
  h1 { font-size: 20px; margin: 0 0 12px; }
  input, button { width: 100%; box-sizing: border-box; padding: 10px 12px; margin-top: 8px;
                  border-radius: 8px; border: 1px solid rgba(127,127,127,.4); font: inherit; }
  button { background: #1f3a5f; color: #fff; border: 0; cursor: pointer; }
  .msg { margin-top: 12px; font-size: 14px; }
  .err { color: #c0392b; }
  .ok { color: #1e8449; }
</style>
</head>
<body>
<main>
  <h1 id="title">ReqArch</h1>
  <div id="body"><p class="msg">Loading…</p></div>
</main>
<script type="module">
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://nrhtzksmsatoznytgjxq.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_vkAzWwR7yTsxYDBpW6gVyQ_277yMIvF'

const title = document.getElementById('title')
const body = document.getElementById('body')
// Supabase appends its result to the URL fragment, e.g. #access_token=…&type=recovery
const params = new URLSearchParams(location.hash.slice(1))
const type = params.get('type')

if (params.get('error_description')) {
  title.textContent = 'Link problem'
  body.innerHTML = `<p class="msg err">${params.get('error_description')}</p>
                    <p class="msg">Request a new email from ReqArch and try again.</p>`
} else if (type === 'recovery') {
  title.textContent = 'Set a new password'
  body.innerHTML = `<input id="pw" type="password" placeholder="New password" autocomplete="new-password" />
                    <button id="go">Update password</button><p class="msg" id="out"></p>`
  // detectSessionInUrl picks the recovery token out of the fragment for us.
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { detectSessionInUrl: true, persistSession: false }
  })
  const out = document.getElementById('out')
  document.getElementById('go').onclick = async () => {
    const password = document.getElementById('pw').value
    if (password.length < 8) { out.className = 'msg err'; out.textContent = 'Use at least 8 characters.'; return }
    const { error } = await supabase.auth.updateUser({ password })
    out.className = error ? 'msg err' : 'msg ok'
    out.textContent = error ? error.message : 'Password updated. Return to ReqArch and sign in.'
  }
} else if (type === 'signup' || type === 'magiclink' || type === 'email_change') {
  title.textContent = 'Email confirmed'
  body.innerHTML = '<p class="msg ok">Your ReqArch account is active. Return to the app and sign in.</p>'
} else {
  title.textContent = 'ReqArch'
  body.innerHTML = '<p class="msg">This page handles account confirmation and password resets for the ReqArch desktop app. Open it from the link in your email.</p>'
}
</script>
</body>
</html>
```

- [ ] **Step 2: Write the Pages workflow**

Create `.github/workflows/pages.yml`:

```yaml
name: Publish auth page

# Publishes ONLY auth-web/. Never point this at /docs — that directory holds internal
# specs and plans and would become public.
on:
  push:
    branches: [main]
    paths: ['auth-web/**', '.github/workflows/pages.yml']
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: auth-web
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Create the supabase pipeline directory**

Create `supabase/config.toml`:

```toml
# Links this repo to the Supabase project so the already-connected GitHub integration has
# something to deploy. v1 adds nothing to `public` — Supabase manages the `auth` schema
# itself — so this exists to make the pipeline live, not to define data.
project_id = "nrhtzksmsatoznytgjxq"

[db]
major_version = 15
```

Create `supabase/migrations/20260828000000_init.sql`:

```sql
-- v1 accounts: intentionally empty.
--
-- Supabase owns the `auth` schema, and this release stores no application data in
-- Postgres. This file exists so the migration pipeline is live and the next feature's
-- migration has somewhere to land.
--
-- RULE for every future migration in this directory: the app ships a PUBLIC publishable
-- key, so every table added to `public` gets `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
-- plus explicit policies in the same migration that creates it. No exceptions.
select 1;
```

- [ ] **Step 4: Confirm no build target picks up the new directories**

Run: `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json && npx electron-vite build`
Expected: clean, and no `auth-web` or `supabase` output under `out/`.

- [ ] **Step 5: Verify the page's two states locally**

Run: `npx http-server auth-web -p 8099` (or `python3 -m http.server 8099 -d auth-web`), then open:
- `http://localhost:8099/#type=signup` → expect the heading **Email confirmed**.
- `http://localhost:8099/#type=recovery` → expect the heading **Set a new password** with a password field and button.
- `http://localhost:8099/` with no hash → expect the neutral explanatory copy.

Expected: all three render; the browser console shows no error loading the supabase ESM bundle.

- [ ] **Step 6: Commit**

```bash
git add auth-web .github/workflows/pages.yml supabase
git commit -m "feat(auth): static confirmation/recovery page, Pages workflow, supabase migration pipeline"
```

- [ ] **Step 7: Record the dashboard steps that are NOT code**

Append to `handoff.md` under a new `### Auth — manual dashboard setup` heading (these block real sign-ups and are the project owner's to do):

```markdown
### Auth — manual dashboard setup (not code, blocks real sign-ups)
1. GitHub repo Settings → Pages → Source = **GitHub Actions** (the `pages.yml` workflow publishes `auth-web/`).
2. Supabase → Authentication → Providers → Email: **Confirm email = ON**.
3. Supabase → Authentication → URL Configuration: Site URL = `https://koruthrejo-png.github.io/SystemEngTool/`, and add the same URL to the redirect allowlist.
4. Supabase → Project Settings → Auth → **custom SMTP** (Resend / Postmark / SES). The built-in sender is rate-limited to a handful of messages an hour and is explicitly not for production — without this, sign-ups silently stall at "check your email".
```

```bash
git add handoff.md && git commit -m "docs(auth): manual Supabase/Pages dashboard setup steps"
```

---

### Task 4: The auth module — client, encrypted storage, sign-in/up/out

**Files:**
- Create: `src/main/auth/index.ts`
- Modify: `src/types/index.ts` (add `AuthUser`)
- Test: `src/main/auth/index.test.ts`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `AUTH_REDIRECT_URL` from `./config`; `shouldClearSession`, `decodeSession` from `./session` (Task 2); `setMe(input: UpdateMeInput)` from `../identity` where `UpdateMeInput` now has `externalId?: string | null` (Task 1).
- Produces:
  - `interface AuthUser { id: string; email: string; displayName: string }` in `src/types/index.ts`
  - `initAuth(userDataDir: string, factory?: ClientFactory): void`
  - `signUp(input: { email: string; password: string; displayName: string }): Promise<{ status: 'confirm-email' }>`
  - `signIn(input: { email: string; password: string }): Promise<AuthUser>`
  - `signOut(): Promise<void>`
  - `getSession(): AuthUser | null` — **synchronous, no network**
  - `resetPassword(email: string): Promise<void>`
  - `refreshInBackground(): Promise<void>`

**Prerequisite:** `@supabase/supabase-js` is already installed as a production dependency (the controller ran `npm i @supabase/supabase-js` before this task).

**Key design points the implementer must not "improve":**
1. `getSession()` is **synchronous and reads the file** — it deliberately does *not* call `supabase.auth.getSession()`, because supabase-js will attempt a network refresh when the token is expired and that blocks the launch path offline.
2. `removeItem` on the storage adapter is **gated behind `allowClear`, default false.** supabase-js deletes stored sessions on its own initiative; the gate means only *we* decide when the cache dies.
3. `refreshInBackground()` is the one and only place `shouldClearSession` is consulted. It is fire-and-forget and must never be awaited on the launch path.
4. The directory is injected (`initAuth(dir)`) for the same reason `initIdentity(dir)` is: tests point it at a temp dir.

- [ ] **Step 1: Write the failing test**

Create `src/main/auth/index.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// safeStorage is Electron's; in tests "encryption" is a reversible byte flip, which is
// enough to prove the blob is not stored as plaintext JSON.
const flip = (s: string): Buffer => Buffer.from([...Buffer.from(s, 'utf8')].map((b) => b ^ 0x5a))
const unflip = (b: Buffer): string => Buffer.from([...b].map((x) => x ^ 0x5a)).toString('utf8')
let encryptionAvailable = true
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString: (s: string) => flip(s),
    decryptString: (b: Buffer) => unflip(b)
  }
}))

import { initAuth, signUp, signIn, signOut, getSession, resetPassword, refreshInBackground } from './index'
import { initIdentity, getMe } from '../identity'

const USER = { id: 'sb-user-123', email: 'v@example.com', user_metadata: { display_name: 'Verified Name' } }
const SESSION = { access_token: 'at', refresh_token: 'rt', expires_at: 99, user: USER }

/** A stand-in for the supabase client: records calls, returns what each test needs. */
function stubClient(overrides: Record<string, any> = {}): { client: any; storage: any; calls: any[] } {
  const calls: any[] = []
  let storage: any = null
  const client = {
    auth: {
      signUp: vi.fn(async (a: any) => { calls.push(['signUp', a]); return { data: { user: USER, session: null }, error: null } }),
      signInWithPassword: vi.fn(async (a: any) => {
        calls.push(['signInWithPassword', a])
        storage?.setItem('k', JSON.stringify(SESSION))
        return { data: { user: USER, session: SESSION }, error: null }
      }),
      signOut: vi.fn(async () => { calls.push(['signOut']); storage?.removeItem('k'); return { error: null } }),
      resetPasswordForEmail: vi.fn(async (e: string, o: any) => { calls.push(['reset', e, o]); return { data: {}, error: null } }),
      refreshSession: vi.fn(async () => ({ data: { session: SESSION }, error: null })),
      ...overrides
    }
  }
  const factory = (_url: string, _key: string, opts: any): any => { storage = opts.auth.storage; return client }
  return { client, storage: () => storage, calls, factory } as any
}

describe('auth module', () => {
  let dir: string
  let identityDir: string
  let stub: any

  beforeEach(() => {
    encryptionAvailable = true
    dir = mkdtempSync(join(tmpdir(), 'reqarch-auth-'))
    identityDir = mkdtempSync(join(tmpdir(), 'reqarch-identity-'))
    initIdentity(identityDir)
    stub = stubClient()
    initAuth(dir, stub.factory)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(identityDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('signUp asks for email confirmation and does not create a session', async () => {
    const result = await signUp({ email: 'v@example.com', password: 'hunter22', displayName: 'Verified Name' })
    expect(result).toEqual({ status: 'confirm-email' })
    expect(getSession()).toBeNull()
    expect(existsSync(join(dir, 'session.bin'))).toBe(false)
    const [, args] = stub.calls.find((c: any[]) => c[0] === 'signUp')
    expect(args.options.emailRedirectTo).toBe('https://koruthrejo-png.github.io/SystemEngTool/')
    expect(args.options.data.display_name).toBe('Verified Name')
  })

  it('signIn returns the user, persists an encrypted session, and updates identity', async () => {
    const user = await signIn({ email: 'v@example.com', password: 'hunter22' })
    expect(user).toEqual({ id: 'sb-user-123', email: 'v@example.com', displayName: 'Verified Name' })
    // no tokens in the returned shape
    expect(Object.keys(user).sort()).toEqual(['displayName', 'email', 'id'])
    expect(JSON.stringify(user)).not.toMatch(/access_token|refresh_token/)
    const raw = readFileSync(join(dir, 'session.bin'))
    expect(raw.toString('utf8')).not.toContain('refresh_token') // encrypted, not plaintext
    const me = getMe()!
    expect(me.displayName).toBe('Verified Name')
    expect(me.email).toBe('v@example.com')
    expect(me.externalId).toBe('sb-user-123')
    expect(me.uuid).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('getSession reads the cached user with no client call at all', async () => {
    await signIn({ email: 'v@example.com', password: 'hunter22' })
    vi.clearAllMocks()
    const cached = getSession()
    expect(cached).toEqual({ id: 'sb-user-123', email: 'v@example.com', displayName: 'Verified Name' })
    expect(stub.client.auth.refreshSession).not.toHaveBeenCalled()
    expect(stub.client.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('signOut clears the cache and externalId but keeps the uuid', async () => {
    await signIn({ email: 'v@example.com', password: 'hunter22' })
    const uuidBefore = getMe()!.uuid
    await signOut()
    expect(getSession()).toBeNull()
    expect(existsSync(join(dir, 'session.bin'))).toBe(false)
    const me = getMe()!
    expect(me.externalId).toBeNull()
    expect(me.uuid).toBe(uuidBefore)
    expect(me.displayName).toBe('Verified Name')
  })

  it('a failed refresh while offline leaves you signed in', async () => {
    await signIn({ email: 'v@example.com', password: 'hunter22' })
    stub.client.auth.refreshSession = vi.fn(async () => ({
      data: { session: null }, error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' }
    }))
    await refreshInBackground()
    expect(getSession()).not.toBeNull()
    expect(getMe()!.externalId).toBe('sb-user-123')
  })

  it('supabase deleting the session on its own does not sign you out', async () => {
    await signIn({ email: 'v@example.com', password: 'hunter22' })
    stub.storage().removeItem('k') // supabase-js clearing storage of its own accord
    expect(getSession()).not.toBeNull()
  })

  it('a genuinely dead refresh token does clear the session', async () => {
    await signIn({ email: 'v@example.com', password: 'hunter22' })
    stub.client.auth.refreshSession = vi.fn(async () => ({
      data: { session: null }, error: { code: 'refresh_token_not_found', status: 400, message: 'Refresh Token Not Found' }
    }))
    await refreshInBackground()
    expect(getSession()).toBeNull()
    expect(getMe()!.externalId).toBeNull()
  })

  it('never writes a plaintext session when the OS keyring is unavailable', async () => {
    encryptionAvailable = false
    await signIn({ email: 'v@example.com', password: 'hunter22' })
    expect(existsSync(join(dir, 'session.bin'))).toBe(false)
    expect(getSession()).toBeNull()
  })

  it('surfaces a sign-in failure as an error', async () => {
    stub.client.auth.signInWithPassword = vi.fn(async () => ({ data: { user: null, session: null }, error: { message: 'Invalid login credentials' } }))
    await expect(signIn({ email: 'v@example.com', password: 'wrong' })).rejects.toThrow('Invalid login credentials')
  })

  it('resetPassword points the recovery email at the static page', async () => {
    await resetPassword('v@example.com')
    const [, email, opts] = stub.calls.find((c: any[]) => c[0] === 'reset')
    expect(email).toBe('v@example.com')
    expect(opts.redirectTo).toBe('https://koruthrejo-png.github.io/SystemEngTool/')
  })

  it('treats a corrupt session file as signed out rather than crashing', () => {
    writeFileSync(join(dir, 'session.bin'), Buffer.from('not a session'))
    expect(getSession()).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/auth/index.test.ts`
Expected: FAIL — `Failed to resolve import "./index"` / `initAuth is not a function`.

- [ ] **Step 3: Add the `AuthUser` type**

In `src/types/index.ts`, next to `LocalIdentity`:

```ts
/** A verified account, as it crosses IPC. Tokens are deliberately absent — no access or
 *  refresh token ever leaves the main process. */
export interface AuthUser {
  id: string
  email: string
  displayName: string
}
```

- [ ] **Step 4: Write the auth module**

Create `src/main/auth/index.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { setMe } from '../identity'
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, AUTH_REDIRECT_URL } from './config'
import { decodeSession, shouldClearSession } from './session'
import type { AuthUser } from '../../types'

type ClientFactory = (url: string, key: string, opts: any) => SupabaseClient

let dir: string | null = null
let client: SupabaseClient | null = null

/** Closed by default. supabase-js deletes stored sessions on its own initiative, and its
 *  idea of "the token is dead" includes cases we refuse to sign out on. The cache is only
 *  ever erased through this gate, and only when WE opened it. */
let allowClear = false

function sessionFile(): string {
  if (!dir) throw new Error('Auth directory not initialised')
  return join(dir, 'session.bin')
}

function encryptionOk(): boolean {
  try { return safeStorage.isEncryptionAvailable() } catch { return false }
}

function readStored(): string | null {
  if (!dir || !existsSync(sessionFile()) || !encryptionOk()) return null
  return decodeSession(readFileSync(sessionFile()), (b) => safeStorage.decryptString(b))
}

function clearStored(): void {
  if (dir) rmSync(sessionFile(), { force: true })
}

/**
 * One session per install, so the storage key is ignored.
 * ponytail: single-file store; give it a key-indexed directory only if this app ever holds
 * more than one Supabase session at a time.
 */
const storage = {
  getItem: (_key: string): string | null => readStored(),
  setItem: (_key: string, value: string): void => {
    // No OS keyring (headless Linux): sign in each launch rather than leave a refresh token
    // in a world-readable file. A login prompt is a better outcome than a leaked token.
    if (!encryptionOk()) {
      console.warn('[auth] safeStorage unavailable — session will not be persisted on this machine')
      return
    }
    writeFileSync(sessionFile(), safeStorage.encryptString(value), { mode: 0o600 })
  },
  removeItem: (_key: string): void => { if (allowClear) clearStored() }
}

export function initAuth(userDataDir: string, factory: ClientFactory = createClient as ClientFactory): void {
  dir = userDataDir
  allowClear = false
  client = factory(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage,
      storageKey: 'reqarch-session',
      persistSession: true,
      autoRefreshToken: true,
      // There is no URL to detect a session in: this is a desktop app, and the email links
      // land on the static web page, never in here.
      detectSessionInUrl: false
    }
  })
}

function must(): SupabaseClient {
  if (!client) throw new Error('Auth not initialised')
  return client
}

function toAuthUser(u: { id: string; email?: string | null; user_metadata?: { display_name?: string } }): AuthUser {
  const email = u.email ?? ''
  return { id: u.id, email, displayName: u.user_metadata?.display_name || email.split('@')[0] || 'You' }
}

export async function signUp(input: { email: string; password: string; displayName: string }): Promise<{ status: 'confirm-email' }> {
  const { error } = await must().auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { display_name: input.displayName }, emailRedirectTo: AUTH_REDIRECT_URL }
  })
  if (error) throw new Error(error.message)
  // Confirmation is required, so there is no session yet. Sign-up is NOT sign-in.
  return { status: 'confirm-email' }
}

export async function signIn(input: { email: string; password: string }): Promise<AuthUser> {
  const { data, error } = await must().auth.signInWithPassword({ email: input.email, password: input.password })
  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('Sign-in returned no user')
  const user = toAuthUser(data.user)
  // The verified name and email replace the local guess. uuid is untouched — setMe enforces it.
  setMe({ displayName: user.displayName, email: user.email, externalId: user.id })
  return user
}

export async function signOut(): Promise<void> {
  allowClear = true
  try {
    await must().auth.signOut()
  } catch {
    // A sign-out that cannot reach the server still signs you out on this machine.
  } finally {
    clearStored()
    allowClear = false
  }
  setMe({ externalId: null })
}

/**
 * The launch path. Reads the encrypted cache and returns — no network call, ever, so a
 * signed-in user on a plane still gets their app. Refresh is refreshInBackground's job.
 */
export function getSession(): AuthUser | null {
  const raw = readStored()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    const u = parsed?.user ?? parsed?.currentSession?.user
    return u ? toAuthUser(u) : null
  } catch {
    return null
  }
}

/**
 * Fire-and-forget after the window opens: renew the token if we happen to be online. The
 * ONLY place a cached session is discarded for a server reason, and only when the server
 * actually said the refresh token is dead. Offline, timeouts and 5xx leave you signed in.
 */
export async function refreshInBackground(): Promise<void> {
  if (!client || !readStored()) return
  try {
    const { error } = await client.auth.refreshSession()
    if (error && shouldClearSession(error)) {
      allowClear = true
      clearStored()
      allowClear = false
      setMe({ externalId: null })
    }
  } catch (err) {
    if (shouldClearSession(err)) {
      allowClear = true
      clearStored()
      allowClear = false
      setMe({ externalId: null })
    }
  }
}

export async function resetPassword(email: string): Promise<void> {
  const { error } = await must().auth.resetPasswordForEmail(email, { redirectTo: AUTH_REDIRECT_URL })
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/main/auth/index.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 6: Typecheck and confirm the dependency placement**

Run: `npx tsc --noEmit -p tsconfig.node.json && node -e "const p=require('./package.json'); if(!p.dependencies['@supabase/supabase-js']) { throw new Error('@supabase/supabase-js must be a production dependency') }"`
Expected: clean, no throw.

- [ ] **Step 7: Commit**

```bash
git add src/main/auth/index.ts src/main/auth/index.test.ts src/types/index.ts package.json package-lock.json
git commit -m "feat(auth): supabase client, encrypted session cache, sign in/up/out"
```

---

### Task 5: IPC surface — handler, boot wiring, preload, api types

**Files:**
- Create: `src/main/handlers/auth.ts`
- Modify: `src/main/index.ts` (imports at lines 3-22, `app.whenReady()` block at lines 42-69)
- Modify: `src/preload/index.ts` (import list at lines 2-19, `app:` block at lines 27-29)
- Modify: `src/types/api.d.ts` (import list at lines 1-18, `app:` block at lines 28-30)
- Test: `src/main/handlers/auth.test.ts`

**Interfaces:**
- Consumes: everything Task 4 produced — `initAuth`, `signUp`, `signIn`, `signOut`, `getSession`, `resetPassword`, `refreshInBackground`, and the `AuthUser` type.
- Produces: `window.api.auth` with exactly these five methods:
  - `signUp(input: { email: string; password: string; displayName: string }): Promise<{ status: 'confirm-email' }>`
  - `signIn(input: { email: string; password: string }): Promise<AuthUser>`
  - `signOut(): Promise<void>`
  - `getSession(): Promise<AuthUser | null>`
  - `resetPassword(email: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `src/main/handlers/auth.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

const handlers = new Map<string, (...a: any[]) => any>()
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: any) => handlers.set(channel, fn) }
}))

const authModule = {
  signUp: vi.fn(async () => ({ status: 'confirm-email' as const })),
  signIn: vi.fn(async () => ({ id: 'sb-user-123', email: 'v@example.com', displayName: 'Verified Name' })),
  signOut: vi.fn(async () => undefined),
  getSession: vi.fn(() => ({ id: 'sb-user-123', email: 'v@example.com', displayName: 'Verified Name' })),
  resetPassword: vi.fn(async () => undefined)
}
vi.mock('../auth', () => authModule)

import { registerAuthHandlers } from './auth'

describe('auth IPC', () => {
  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
    registerAuthHandlers()
  })

  it('registers exactly the five auth channels', () => {
    expect([...handlers.keys()].sort()).toEqual(
      ['auth:getSession', 'auth:resetPassword', 'auth:signIn', 'auth:signOut', 'auth:signUp']
    )
  })

  it('passes credentials through and returns shapes with no tokens in them', async () => {
    const signedUp = await handlers.get('auth:signUp')!({}, { email: 'v@example.com', password: 'hunter22', displayName: 'Verified Name' })
    expect(signedUp).toEqual({ status: 'confirm-email' })

    const signedIn = await handlers.get('auth:signIn')!({}, { email: 'v@example.com', password: 'hunter22' })
    expect(signedIn).toEqual({ id: 'sb-user-123', email: 'v@example.com', displayName: 'Verified Name' })

    const cached = await handlers.get('auth:getSession')!({})
    for (const shape of [signedUp, signedIn, cached]) {
      expect(JSON.stringify(shape)).not.toMatch(/access_token|refresh_token/)
    }
    expect(authModule.signIn).toHaveBeenCalledWith({ email: 'v@example.com', password: 'hunter22' })
  })

  it('forwards signOut and resetPassword', async () => {
    await handlers.get('auth:signOut')!({})
    expect(authModule.signOut).toHaveBeenCalled()
    await handlers.get('auth:resetPassword')!({}, 'v@example.com')
    expect(authModule.resetPassword).toHaveBeenCalledWith('v@example.com')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/handlers/auth.test.ts`
Expected: FAIL — `Failed to resolve import "./auth"`.

- [ ] **Step 3: Write the handler**

Create `src/main/handlers/auth.ts`:

```ts
import { ipcMain } from 'electron'
import { signUp, signIn, signOut, getSession, resetPassword } from '../auth'
import type { AuthUser } from '../../types'

/** Thin pass-through, matching handlers/app.ts. Every return shape here is token-free by
 *  construction — the auth module never hands one out. */
export function registerAuthHandlers(): void {
  ipcMain.handle('auth:signUp', (_e, input: { email: string; password: string; displayName: string }) => signUp(input))
  ipcMain.handle('auth:signIn', (_e, input: { email: string; password: string }): Promise<AuthUser> => signIn(input))
  ipcMain.handle('auth:signOut', () => signOut())
  ipcMain.handle('auth:getSession', (): AuthUser | null => getSession())
  ipcMain.handle('auth:resetPassword', (_e, email: string) => resetPassword(email))
}
```

- [ ] **Step 4: Wire it into boot**

In `src/main/index.ts`, add beside the other handler imports (after line 22):

```ts
import { registerAuthHandlers } from './handlers/auth'
import { initAuth, refreshInBackground } from './auth'
```

Then in the `app.whenReady()` block, add `initAuth` immediately after `initIdentity` and `registerAuthHandlers()` after `registerAppHandlers()`, and kick the refresh after the window is created:

```ts
  initIdentity(app.getPath('userData'))
  // The session cache lives beside identity.json and is read synchronously at gate time,
  // so it must be ready before any renderer call.
  initAuth(app.getPath('userData'))
  registerUserHandlers()
  // …existing registrations unchanged…
  registerAppHandlers()
  registerAuthHandlers()
  createWindow()
  // Fire-and-forget: renew the token if we are online. Deliberately NOT awaited — the app
  // must open at the same speed on a plane as on a desk.
  void refreshInBackground()
```

- [ ] **Step 5: Expose it in preload**

In `src/preload/index.ts`, add `AuthUser` to the type import list, and add an `auth` block right after the existing `app` block:

```ts
  auth: {
    signUp: (input: { email: string; password: string; displayName: string }): Promise<{ status: 'confirm-email' }> => ipcRenderer.invoke('auth:signUp', input),
    signIn: (input: { email: string; password: string }): Promise<AuthUser> => ipcRenderer.invoke('auth:signIn', input),
    signOut: (): Promise<void> => ipcRenderer.invoke('auth:signOut'),
    getSession: (): Promise<AuthUser | null> => ipcRenderer.invoke('auth:getSession'),
    resetPassword: (email: string): Promise<void> => ipcRenderer.invoke('auth:resetPassword', email)
  },
```

- [ ] **Step 6: Declare it in `src/types/api.d.ts`**

Add `AuthUser` to the type import list, and after the `app` block:

```ts
      auth: {
        signUp(input: { email: string; password: string; displayName: string }): Promise<{ status: 'confirm-email' }>
        signIn(input: { email: string; password: string }): Promise<AuthUser>
        signOut(): Promise<void>
        getSession(): Promise<AuthUser | null>
        resetPassword(email: string): Promise<void>
      }
```

- [ ] **Step 7: Run the tests and both typechecks**

Run: `npx vitest run src/main/handlers/auth.test.ts && npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json && npx electron-vite build`
Expected: 3 tests pass; both typechecks clean; build clean across all 3 targets.

- [ ] **Step 8: Commit**

```bash
git add src/main/handlers/auth.ts src/main/handlers/auth.test.ts src/main/index.ts src/preload/index.ts src/types/api.d.ts
git commit -m "feat(auth): auth IPC channels, preload surface, boot wiring"
```

---

### Task 6: Renderer store slice

**Files:**
- Modify: `src/renderer/src/store/index.ts` (state interface near line 52 where `me`/`loadMe`/`setMe` live; initial state near line 203; `run()` helper is at line 876)
- Test: `src/renderer/src/store/auth.test.ts`

**Interfaces:**
- Consumes: `window.api.auth.*` (Task 5).
- Produces, on the store:
  - `session: AuthUser | null`
  - `signUpPending: boolean` — true after a successful sign-up, so the gate can show "check your email"
  - `sessionLoaded: boolean` — false until the first `loadSession()` resolves, so the gate does not flash the form during launch
  - `loadSession(): Promise<void>`
  - `signIn(input: { email: string; password: string }): Promise<void>`
  - `signUp(input: { email: string; password: string; displayName: string }): Promise<void>`
  - `signOut(): Promise<void>`
  - `resetPassword(email: string): Promise<void>`
  - `clearSignUpPending(): void`

**Convention to follow:** actions that can fail go through the existing `run()` helper (`src/renderer/src/store/index.ts:876`), which catches and puts the message on `lastError`. Read-only loads (`loadMe`) are plain async. `loadSession` follows `loadMe`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/store/auth.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from './index'

const USER = { id: 'sb-user-123', email: 'v@example.com', displayName: 'Verified Name' }

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({ session: null, signUpPending: false, sessionLoaded: false, lastError: null })
  ;(window as any).api = {
    ...(window as any).api,
    auth: {
      getSession: vi.fn().mockResolvedValue(USER),
      signIn: vi.fn().mockResolvedValue(USER),
      signUp: vi.fn().mockResolvedValue({ status: 'confirm-email' }),
      signOut: vi.fn().mockResolvedValue(undefined),
      resetPassword: vi.fn().mockResolvedValue(undefined)
    },
    users: { me: vi.fn().mockResolvedValue(null), list: vi.fn().mockResolvedValue([]) }
  }
})

describe('auth store slice', () => {
  it('loadSession fills the session and flips sessionLoaded', async () => {
    await useStore.getState().loadSession()
    expect(useStore.getState().session).toEqual(USER)
    expect(useStore.getState().sessionLoaded).toBe(true)
  })

  it('loadSession still flips sessionLoaded when there is no session', async () => {
    ;(window as any).api.auth.getSession = vi.fn().mockResolvedValue(null)
    await useStore.getState().loadSession()
    expect(useStore.getState().session).toBeNull()
    expect(useStore.getState().sessionLoaded).toBe(true)
  })

  it('signIn sets the session', async () => {
    await useStore.getState().signIn({ email: 'v@example.com', password: 'hunter22' })
    expect(useStore.getState().session).toEqual(USER)
    expect(useStore.getState().lastError).toBeNull()
  })

  it('a failed signIn surfaces via lastError and leaves you signed out', async () => {
    ;(window as any).api.auth.signIn = vi.fn().mockRejectedValue(new Error('Invalid login credentials'))
    await useStore.getState().signIn({ email: 'v@example.com', password: 'wrong' })
    expect(useStore.getState().session).toBeNull()
    expect(useStore.getState().lastError).toBe('Invalid login credentials')
  })

  it('signUp does NOT sign you in — it sets signUpPending', async () => {
    await useStore.getState().signUp({ email: 'v@example.com', password: 'hunter22', displayName: 'Verified Name' })
    expect(useStore.getState().session).toBeNull()
    expect(useStore.getState().signUpPending).toBe(true)
  })

  it('signOut clears the session', async () => {
    await useStore.getState().signIn({ email: 'v@example.com', password: 'hunter22' })
    await useStore.getState().signOut()
    expect(useStore.getState().session).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/store/auth.test.ts`
Expected: FAIL — `useStore.getState().loadSession is not a function`.

- [ ] **Step 3: Add the slice to the store interface**

In `src/renderer/src/store/index.ts`, add `AuthUser` to the type import from `../../../types`, and add to the state interface right above the existing `me: LocalIdentity | null` (line ~52):

```ts
  /** The verified account. null = signed out; the app shell is gated on this. */
  session: AuthUser | null
  /** False until the first loadSession() resolves, so the gate does not flash the sign-in
   *  form over a session that was already on disk. */
  sessionLoaded: boolean
  /** Set after a successful sign-up: the account exists but is unusable until the emailed
   *  link is clicked, so the gate shows "check your email" rather than signing you in. */
  signUpPending: boolean
  loadSession: () => Promise<void>
  signIn: (input: { email: string; password: string }) => Promise<void>
  signUp: (input: { email: string; password: string; displayName: string }) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  clearSignUpPending: () => void
```

- [ ] **Step 4: Add the implementations**

In the same file, next to `me: null,` / `loadMe` (line ~203):

```ts
  session: null,
  sessionLoaded: false,
  signUpPending: false,
  loadSession: async () => {
    // Launch path: main reads the encrypted cache off disk, no network. Always flip
    // sessionLoaded, including on failure, or the gate hangs on a spinner forever.
    try {
      set({ session: await window.api.auth.getSession() })
    } finally {
      set({ sessionLoaded: true })
    }
  },
  signIn: (input) => run(async () => {
    set({ session: await window.api.auth.signIn(input), signUpPending: false })
    // The verified name landed in identity.json; re-read it so the avatar updates.
    set({ me: await window.api.users.me() })
  }),
  signUp: (input) => run(async () => {
    await window.api.auth.signUp(input)
    // Sign-up is not sign-in: confirmation is required first.
    set({ signUpPending: true })
  }),
  signOut: () => run(async () => {
    await window.api.auth.signOut()
    set({ session: null, me: await window.api.users.me() })
  }),
  resetPassword: (email) => run(async () => { await window.api.auth.resetPassword(email) }),
  clearSignUpPending: () => set({ signUpPending: false }),
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/store/auth.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.web.json`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/store/index.ts src/renderer/src/store/auth.test.ts
git commit -m "feat(auth): renderer session slice — loadSession/signIn/signUp/signOut/resetPassword"
```

---

### Task 7: AuthGate and app wiring

**Files:**
- Create: `src/renderer/src/components/Auth/AuthGate.tsx`
- Test: `src/renderer/src/components/Auth/AuthGate.test.tsx`
- Modify: `src/renderer/src/App.tsx` (default export wraps in `AuthGate`; avatar menu at lines ~118-127 gains Sign out)

**Interfaces:**
- Consumes: the store slice from Task 6 — `session`, `sessionLoaded`, `signUpPending`, `loadSession`, `signIn`, `signUp`, `signOut`, `resetPassword`, `clearSignUpPending`, plus the existing `lastError` / `clearError`.
- Produces: `export default function AuthGate({ children }: { children: React.ReactNode }): JSX.Element`.

**Existing pieces to reuse (do not rebuild):** `Button`, `Input` and `Panel` from `./components/ui`; `HeaderMenu` / `MenuItem` for the avatar menu.

**Structure of `App.tsx`:** it currently `export default function App()`. Rename the existing component to `AppShell` (keep everything inside unchanged) and add a new default export that wraps it:

```tsx
export default function App(): JSX.Element {
  return <AuthGate><AppShell /></AuthGate>
}
```

`AppShell`'s existing `useEffect(() => { loadProject(); loadMe() }, [])` stays exactly as it is — it only runs once the gate has rendered it, which is correct: no project is opened before sign-in.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/Auth/AuthGate.test.tsx`:

```tsx
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

  it('renders the app when a cached session exists', async () => {
    stubApi({ getSession: vi.fn().mockResolvedValue(USER) })
    render(<AuthGate><div>THE APP</div></AuthGate>)
    await waitFor(() => expect(screen.getByText('THE APP')).toBeInTheDocument())
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
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
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/components/Auth/AuthGate.test.tsx`
Expected: FAIL — `Failed to resolve import "./AuthGate"`.

- [ ] **Step 3: Write the gate**

Create `src/renderer/src/components/Auth/AuthGate.tsx`:

```tsx
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

  useEffect(() => { loadSession() }, [])

  if (!sessionLoaded) return <div className="min-h-screen grid place-items-center text-ink-faint">Loading…</div>
  if (session) return <>{children}</>

  function go(mode: Mode): void {
    clearError()
    setResetSent(false)
    clearSignUpPending()
    setMode(mode)
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
            {lastError && <p className="text-sm text-red-600">{lastError}</p>}
            <Button type="submit" disabled={busy}>
              {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
            </Button>
          </form>
        )}

        {!confirmation && (
          <div className="mt-4 flex justify-between text-sm">
            {mode === 'signin' ? (
              <>
                <button type="button" className="text-accent hover:underline" onClick={() => go('forgot')}>Forgot password?</button>
                <span className="text-ink-faint">No account? <button type="button" className="text-accent hover:underline" onClick={() => go('signup')}>Create one</button></span>
              </>
            ) : (
              <button type="button" className="text-accent hover:underline" onClick={() => go('signin')}>Back to sign in</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

If `Input` does not forward `aria-label`, `minLength`, `type` or `autoComplete` through to the underlying `<input>`, check `src/renderer/src/components/ui` first — if it spreads `...props`, nothing is needed; if it does not, spread them rather than adding a second input component. If the `text-accent` / `text-ink-faint` classes are not in `tailwind.config.js`, use the nearest class the codebase already uses in `App.tsx` instead of inventing one.

- [ ] **Step 4: Wire it into `App.tsx`**

In `src/renderer/src/App.tsx`:
1. Add `import AuthGate from './components/Auth/AuthGate'` beside the other component imports.
2. Rename `export default function App(): JSX.Element {` to `function AppShell(): JSX.Element {` — the body is unchanged.
3. Add at the end of the file:

```tsx
export default function App(): JSX.Element {
  return (
    <AuthGate>
      <AppShell />
    </AuthGate>
  )
}
```

4. Add Sign out to the avatar menu, after the existing `People` item (line ~125):

```tsx
                <MenuItem onClick={() => { close(); signOut() }}>Sign out</MenuItem>
```

and add `signOut` to the destructured `useStore()` call at the top of `AppShell`.

- [ ] **Step 5: Run the gate tests**

Run: `npx vitest run src/renderer/src/components/Auth/AuthGate.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 6: Run the full suite and both typechecks**

Run: `npx vitest run && npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json && npx electron-vite build`
Expected: typechecks and build clean. Suite: everything green **except** the pre-existing `App.test.tsx` "open" button failure.

`src/renderer/src/App.test.tsx` renders `App`, which is now the gate — its existing tests will fail unless they get past it. Fix them by seeding a session in `beforeEach` rather than by weakening the gate:

```ts
  useStore.setState({ session: { id: 'test-user', email: 't@example.com', displayName: 'Test' }, sessionLoaded: true })
```

and add `auth: { getSession: vi.fn().mockResolvedValue({ id: 'test-user', email: 't@example.com', displayName: 'Test' }), signOut: vi.fn() }` to whatever `window.api` stub that file already builds. Do the same in any other test that renders `App`. The pre-existing "open" button failure stays failing — do not fix it here, it is out of scope.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/Auth src/renderer/src/App.tsx src/renderer/src/App.test.tsx
git commit -m "feat(auth): AuthGate wraps the app shell; Sign out in the avatar menu"
```

---

## Final Gate (controller, after Task 7)

- [ ] `npx tsc --noEmit -p tsconfig.node.json` — clean
- [ ] `npx tsc --noEmit -p tsconfig.web.json` — clean
- [ ] `npx electron-vite build` — clean, 3 targets
- [ ] `npx vitest run` — everything green except the pre-existing `App.test.tsx` "open" test. Expect roughly **519 + 32 new = ~551 passed / 1 failed**.
- [ ] `grep -rn "service_role" src auth-web supabase` — **must return nothing.**
- [ ] `grep -rn "access_token\|refresh_token" src/preload src/renderer src/types/api.d.ts` — **must return nothing.** No token shape may exist outside `src/main/auth/`.

## Live-Verify (controller, per the handoff technique)

`npm run dev`, then drive a standalone Electron with `env: { ELECTRON_RENDERER_URL: 'http://localhost:5173/' }` via Playwright `_electron` — without that env var you screenshot the stale `out/renderer` bundle.

**Blocked until the manual dashboard setup from Task 3 Step 7 is done** (custom SMTP especially — without it the confirmation email never arrives).

1. Sign up with a real address → the app shows "Check your email"; the confirmation email arrives; the link opens the Pages site showing **Email confirmed**.
2. Sign in → the app shell renders; the avatar shows the verified display name and email.
3. Edit a requirement → its change-history row carries the verified display name.
4. `ls -l ~/Library/Application\ Support/ReqArch*/session.bin` exists; `strings` on it shows no `refresh_token`.
5. `identity.json` shows the same `uuid` as before sign-in, now with `externalId` set. The project's `users` row has `external_id` populated.
6. **Quit, turn off Wi-Fi, relaunch** → the app opens straight into the shell, no sign-in prompt, fully usable. This is the load-bearing check.
7. Sign out from the avatar menu → back to the gate; `session.bin` is gone; `identity.json` keeps its uuid and name with `externalId: null`.
8. Forgot password → the recovery email lands on the Pages page in `type=recovery` mode; setting a new password succeeds and the new password signs in.

## Deliberately Out of Scope (per the spec's non-goals)

No cloud data or `public` tables; no OAuth / SSO / magic links; no `profiles` table (display name lives in `user_metadata`); no orgs, roles, teams, MFA or licensing; no migration of existing `.reqarch` rosters. Backlog item 36 (comments) still waits on the multi-user server.

## Known Risks Carried

- **Existing installs hit a sign-in wall on next launch.** Local files and uuid-keyed attribution are untouched, but it is a visible one-time change.
- **Linux with no keyring** falls back to sign-in-every-launch (`safeStorage.isEncryptionAvailable()` false). Logged, never plaintext.
- **Without custom SMTP, sign-ups silently stall** at "check your email" — Supabase's built-in sender is rate-limited to a handful of messages per hour.
- **`shouldClearSession` is the one bug here that loses trust rather than data.** It is pure and gets the most direct test in the suite; the storage-adapter `allowClear` gate is the second layer.
