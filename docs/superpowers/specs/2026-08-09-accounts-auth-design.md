# Design: User Accounts — Supabase Auth (email + password)

**Date:** 2026-08-09
**Status:** SPEC — not yet built
**Supabase project:** `nrhtzksmsatoznytgjxq` (eu-west-1), `https://nrhtzksmsatoznytgjxq.supabase.co`

## Purpose

ReqArch has no accounts. Identity today is a locally-minted, unverified uuid in
`userData/identity.json` (`src/main/identity.ts`) — you can call yourself anything, and nothing
checks. Every attribution stamp (`created_by`, `updated_by`, `requirement_history.changed_by`,
`baselines.created_by`) hangs off that guess.

This spec adds **real, verified accounts**: sign up / sign in with email + password against Supabase
Auth, session cached on disk, verified name and email flowing into the existing attribution
machinery. It is the first step toward the server end-goal (team/org system-of-record, SSO) and the
prerequisite for every later step — cloud projects, roles, billing, comments (backlog item 36).

Project data does **not** move. `.reqarch` files stay local SQLite documents.

## Non-goals (v1)

- **No cloud data.** No project sync, no Postgres tables for requirements, no RLS policies beyond
  what Supabase's `auth` schema ships with. Nothing in `public`.
- **No OAuth / SSO / magic links.** All three need a browser round-trip back into Electron — a
  registered `reqarch://` protocol handler or a loopback server. Email + password needs neither: the
  entire flow is an in-app form. The session store built here carries OAuth unchanged when it lands.
- **No `profiles` table.** Display name lives in Supabase `user_metadata` until something needs to
  query it server-side.
- **No orgs, roles, teams, MFA, or licensing.**
- **No migration of existing `.reqarch` rosters.** Old `users` rows keep their local uuid and stay
  correctly attributed (see "Identity model").

## Decisions

### 1. Gate: sign in once, then offline forever

First launch requires a network connection and an account. After that the cached session opens the
app **immediately, with no network call on the launch path**, and the app stays fully usable offline
indefinitely. The token is refreshed silently whenever a connection happens to exist.

This buys a countable user base without breaking the local-first promise: a desktop document editor
that stops working on a plane is a broken document editor.

### 2. A failed refresh does NOT sign you out

The load-bearing rule. The cached session is cleared in exactly two cases:

1. The user explicitly signs out.
2. The server responds and that response actually says the refresh token is dead
   (`invalid_refresh_token` / `refresh_token_not_found`, HTTP 400/401 from the token endpoint).

Network errors, DNS failures, timeouts, 5xx, and "offline" are **never** grounds for clearing it. Get
this backwards and every flight ejects the user from their own local files.

Expressed as one pure, unit-tested predicate:

```ts
// src/main/auth/session.ts
export function shouldClearSession(err: unknown): boolean
```

### 3. Local uuid stays the identity key; Supabase id goes in `external_id`

`users.uuid` in each `.reqarch` is **not** replaced by the Supabase user id.

`migrations.ts:19-23` already reserved `external_id` for exactly this, and its comment states the
rule: cross-file identity resolves through uuid, or through `external_id`/`email` once SSO lands.
Existing `.reqarch` files already carry roster rows keyed on the locally-minted uuid; swapping the
key would fork one human into two roster rows and orphan every attribution already written.

So: `identity.json` keeps its uuid forever, and gains an `externalId` field set on sign-in.
`currentUserRowId`'s upsert writes `external_id` alongside `display_name`/`email`. A future server
ingesting many files reconciles on `external_id`.

### 4. Open signup, email confirmation required

Anyone can register; the account is unusable until the emailed link is clicked.

Consequence: `signUp` returns **no session** until confirmation. The UI must land on a "check your
email" state and must not treat sign-up as sign-in.

### 5. Confirmation and reset links land on a static page, not the app

Both Supabase emails contain a link that has to go *somewhere*. Registering a protocol handler is the
plumbing this whole design exists to avoid, so instead: **one static HTML file** in `auth-web/`,
published to GitHub Pages by a small Actions workflow, set as the Supabase Site URL and added to the
redirect allowlist.

One file, two states, switched on the URL hash Supabase appends:

- `type=signup` → "Email confirmed. Return to ReqArch and sign in."
- `type=recovery` → a set-a-new-password form calling `supabase.auth.updateUser({ password })` with
  the recovery token already in the URL.

**Do not** publish Pages from the repo's `/docs` folder — that directory holds internal specs and
plans, and would become public. Publish `auth-web/` explicitly via the workflow.

### 6. Keys

The app ships the project URL and the **publishable** key
(`sb_publishable_vkAzWwR7yTsxYDBpW6gVyQ_277yMIvF`, preferred over the legacy `anon` JWT). Hardcoded
in `src/main/auth/config.ts` with a comment stating it is a public key — no env plumbing for a single
project; add it when a second (staging) project exists.

The `service_role` key never enters this repo, this app, or any build artifact.

Because the publishable key is public and shipped in a binary that anyone can unzip, **every table
ever added to `public` gets RLS enabled, without exception.** Nothing in v1 adds one.

## Architecture

### Main process owns everything

`@supabase/supabase-js` — the one new runtime dependency — is imported in the main process only. No
token, refresh token, or Supabase client ever crosses the IPC boundary into the renderer.

```
src/main/auth/
  config.ts     — project URL + publishable key (public, hardcoded)
  session.ts    — PURE: encode/decode the cached session, shouldForget(err). No Electron, no network.
  index.ts      — the supabase client, storage adapter, signUp/signIn/signOut/getSession/resetPassword
src/main/handlers/auth.ts — IPC registration (thin, matches handlers/app.ts + handlers/users.ts)
```

**Session persistence.** There is no `localStorage` in the main process, so `createClient` is handed
a custom `storage` adapter writing to `userData/session.bin`, encrypted with Electron
`safeStorage.encryptString`. Config: `persistSession: true`, `autoRefreshToken: true`,
`detectSessionInUrl: false`.

If `safeStorage.isEncryptionAvailable()` returns false (possible on Linux with no keyring), the
session is **not persisted in plaintext** — the user signs in each launch on that machine, and the
condition is logged. A refresh token in a world-readable file is a worse outcome than a login prompt.

### IPC surface

New channels in `src/main/handlers/auth.ts`, registered in `src/main/index.ts` beside the others:

| Channel | Args | Returns |
|---|---|---|
| `auth:signUp` | `{ email, password, displayName }` | `{ status: 'confirm-email' }` |
| `auth:signIn` | `{ email, password }` | `AuthUser` |
| `auth:signOut` | — | `void` |
| `auth:getSession` | — | `AuthUser \| null` |
| `auth:resetPassword` | `email` | `void` |

`AuthUser = { id: string; email: string; displayName: string }` — new type in `src/types/index.ts`.
Tokens are deliberately absent from every return shape.

Preload gains `api.auth.*` (`src/preload/index.ts`), typed in `src/types/api.d.ts`, following the
existing per-domain object convention.

### Identity integration

`src/main/identity.ts` keeps ownership of `getMe()`; auth feeds it.

- `LocalIdentity` gains `externalId: string | null`.
- On successful `auth:signIn`, main calls into identity to set `displayName` (from
  `user_metadata.display_name`), `email` (verified, from `auth.users`), and `externalId` (the
  Supabase user id). `uuid` is untouched — immutable, as `setMe` already enforces.
- On `auth:signOut`, `externalId` clears; uuid, name, and email persist as the unverified local
  identity.
- `currentUserRowId`'s `INSERT … ON CONFLICT(uuid) DO UPDATE` gains `external_id` in both the insert
  column list and the update set. No migration needed — the column already exists.

Every downstream attribution path (requirements, history, baselines) is unchanged and picks up the
verified name for free.

### Renderer

- Store slice: `session: AuthUser | null`, plus `signUp`/`signIn`/`signOut`/`loadSession`/
  `resetPassword` through the existing `run()` / `lastError` convention.
- New `src/renderer/src/components/Auth/AuthGate.tsx` wraps the app shell in `App.tsx`:
  - initial `loadSession()` — session present → render the app;
  - none → render the sign-in / sign-up / forgot-password form;
  - post-sign-up → "check your email" state, not signed in.
- Sign out lives in the existing avatar menu, next to People and Settings.

### Server side

- New `supabase/` directory (`config.toml` + `migrations/`) committed to the repo. This is what makes
  the GitHub integration already connected to this repo do anything — it deploys
  `supabase/migrations/*.sql` on push, and there are currently none.
- The v1 migration is a no-op placeholder: Supabase manages the `auth` schema itself, and v1 adds
  nothing to `public`. The directory exists so the pipeline is live and the next feature's migration
  has somewhere to land.
- Dashboard configuration (not code): email confirmations ON, Site URL = the Pages URL, redirect
  allowlist = the same, and **custom SMTP** — Supabase's built-in sender is rate-limited to a handful
  of messages per hour and is explicitly not for production. Resend, Postmark, or SES.

## Data flow

```
Sign up:  form → auth:signUp → supabase.auth.signUp({ emailRedirectTo: <pages URL> })
          → "check your email" → user clicks link → Pages page confirms → user returns and signs in

Sign in:  form → auth:signIn → signInWithPassword → session encrypted to session.bin
          → identity.json updated (displayName/email/externalId) → AuthUser to renderer → app renders

Launch:   getSession reads session.bin (no network) → app renders → autoRefreshToken renews later,
          and a failed renew leaves the session in place unless shouldClearSession says otherwise

Reset:    form → auth:resetPassword → resetPasswordForEmail({ redirectTo: <pages URL> })
          → Pages page (type=recovery) → updateUser({ password })
```

## Testing

**Pure** (`src/main/auth/session.test.ts`) — no Electron, no network, so it runs in the normal suite:

- `shouldClearSession`: true for `invalid_refresh_token` / `refresh_token_not_found`; **false** for a
  network error, a timeout, a 500, and an unrecognised error. This is the offline rule.
- session encode/decode round-trip, and a corrupt/truncated blob decoding to `null` rather than
  throwing.

**Handler** (`src/main/handlers/auth.test.ts`) with a stubbed supabase client:

- `signUp` with confirmation pending returns `{ status: 'confirm-email' }` and does **not** persist a
  session.
- `signIn` persists the session and writes `displayName`/`email`/`externalId` into identity, leaving
  `uuid` unchanged.
- `signOut` clears the session and `externalId` but preserves `uuid`.
- No return shape contains `access_token` or `refresh_token`.
- `currentUserRowId` upserts `external_id` into the roster row (extends the existing identity tests).

**Renderer** (`AuthGate.test.tsx`): form when no session; app when a session; "check your email"
after sign-up; sign-in error surfaces via `lastError`.

**Live-verify** (Playwright `_electron`, per the handoff technique): real sign-up against the live
project → confirmation email received and clicked → sign in → edit a requirement and confirm the
history row carries the verified display name → **quit, disable the network, relaunch, and confirm
the app opens and stays usable** → sign out returns to the gate.

## Risks

- **Email deliverability.** Without custom SMTP configured first, sign-ups silently stall at "check
  your email". Configure SMTP before the first real user.
- **Existing installs.** Anyone already using the app gets a sign-in wall on next launch. Their local
  files and uuid-keyed attribution are untouched, but this is a visible one-time change.
- **Linux without a keyring** falls back to sign-in-every-launch.
- **Bad `shouldClearSession`** is the one bug here that loses user trust rather than data. It gets the
  most direct test in the suite.
