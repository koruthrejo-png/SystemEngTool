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
