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
