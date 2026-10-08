-- =============================================================================
-- Lock down what's public (2026-10-07 audit, Batch 3).
--
-- RLS stays open by design (decision 0002). This closes three concrete holes:
--   1. players.claim_code and players.browser_id were readable with the public
--      anon key, so anyone could list every claim code and become any player.
--      They are now column-restricted; the app reads its own row and claims by
--      code through two SECURITY DEFINER functions.
--   2. Anyone could overwrite or delete any game logo or avatar. Writes to both
--      buckets now need the first path segment to be the caller's own player id
--      (auth.uid() -> players.auth_id, the same owner model as tags in
--      20260924000000_item_library.sql). Public read is unchanged.
--   3. Anyone could rewrite another player's browser_id (a takeover that skips
--      the claim code) or re-point an owned player's auth_id (which would hand
--      over their tags, cards and storage folder). Both are blocked below.
--
-- HOW TO APPLY (the live DB is migrated by hand):
--   Paste this whole file into the Supabase SQL editor and run it, RIGHT BEFORE
--   merging the PR that carries it. Every statement is safe to re-run.
--   Between running it and the Cloudflare deploy finishing, the CURRENTLY
--   deployed app breaks: its PlayerProvider does select('*') on players and its
--   claim looks up by claim_code, and both are now "permission denied". Every
--   page sits on "can't reach the server" until the new build is live (a few
--   minutes). Then: regenerate types (or keep the hand-edited ones), re-mark
--   players.Insert.claim_code optional (decision 0003), merge.
--
-- Still readable on players by anon/authenticated: id, display_name,
-- avatar_url, auth_id, created_at, updated_at. auth_id must stay readable: every
-- owner policy runs `select id from players where auth_id = auth.uid()` with
-- the caller's own privileges.
-- =============================================================================

-- ── 1. Column-restricted reads on players ───────────────────────────────────

-- Supabase grants table-wide SELECT/UPDATE to anon and authenticated by
-- default. Swap those for column lists. service_role and postgres keep all.
revoke select on public.players from anon, authenticated;
grant select (id, display_name, avatar_url, auth_id, created_at, updated_at)
  on public.players to anon, authenticated;

-- Updates: the app only ever writes display_name, avatar_url and the one-time
-- auth_id backfill. browser_id and claim_code are no longer writable, so a
-- PATCH can't move someone's identity onto your browser.
revoke update on public.players from anon, authenticated;
grant update (display_name, avatar_url, auth_id, updated_at)
  on public.players to anon, authenticated;

-- The claim-code trigger checks for a collision with `select ... where
-- claim_code = candidate`. It ran with the inserting user's privileges, which
-- can no longer read claim_code, so every new player would fail. Run it as the
-- owner instead; it only ever touches the row being inserted.
alter function public.set_claim_code() security definer;
alter function public.set_claim_code() set search_path = public;

-- auth_id is the owner key for tags, library items, cards and both storage
-- buckets. It may be filled once (the backfill for players made before
-- anonymous auth), never re-pointed, or anyone could adopt another player's
-- library by writing their own auth.uid() into it.
create or replace function public.players_auth_id_is_write_once()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.auth_id is not null and new.auth_id is distinct from old.auth_id then
    raise exception 'players.auth_id is already set' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists players_auth_id_write_once on public.players;
create trigger players_auth_id_write_once
  before update of auth_id on public.players
  for each row execute function public.players_auth_id_is_write_once();

-- ── 2. My own row, and claiming by code ─────────────────────────────────────

-- Knowing a browser_id means it is yours (it lives only in that browser's
-- localStorage), so this returns the whole row, claim_code included: the
-- Profile modal shows it so you can type it on your other PC.
create or replace function public.get_my_player(p_browser_id text)
returns setof public.players
language sql
stable
security definer
set search_path = public
as $$
  select * from public.players where browser_id = p_browser_id limit 1;
$$;

-- Knowing a claim code means it is yours too. Returns the browser_id so this
-- machine can adopt it (ProfileModal's Claim), exactly as the old direct read
-- did. Nothing is written.
create or replace function public.claim_player(p_claim_code text)
returns table (id uuid, browser_id text, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.browser_id, p.display_name
  from public.players p
  where p.claim_code = p_claim_code
  limit 1;
$$;

revoke all on function public.get_my_player(text) from public;
revoke all on function public.claim_player(text) from public;
grant execute on function public.get_my_player(text) to anon, authenticated;
grant execute on function public.claim_player(text) to anon, authenticated;

-- ── 3. Owner-scoped storage writes ──────────────────────────────────────────

-- Objects are written at <my player id>/<file>. Old flat-path objects
-- (<tagId>.png, <playerId>.<ext>) stay readable; nobody can overwrite them now.
drop policy if exists "game-logos: anyone can upload" on storage.objects;
drop policy if exists "game-logos: anyone can update" on storage.objects;
drop policy if exists "game-logos: anyone can delete" on storage.objects;
drop policy if exists "game-logos: owner can upload" on storage.objects;
drop policy if exists "game-logos: owner can update" on storage.objects;
drop policy if exists "game-logos: owner can delete" on storage.objects;

create policy "game-logos: owner can upload"
  on storage.objects for insert
  with check (
    bucket_id = 'game-logos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = (select id::text from public.players where auth_id = auth.uid() limit 1)
  );

create policy "game-logos: owner can update"
  on storage.objects for update
  using (
    bucket_id = 'game-logos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = (select id::text from public.players where auth_id = auth.uid() limit 1)
  )
  with check (
    bucket_id = 'game-logos'
    and (storage.foldername(name))[1] = (select id::text from public.players where auth_id = auth.uid() limit 1)
  );

create policy "game-logos: owner can delete"
  on storage.objects for delete
  using (
    bucket_id = 'game-logos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = (select id::text from public.players where auth_id = auth.uid() limit 1)
  );

drop policy if exists "avatars: anyone can upload" on storage.objects;
drop policy if exists "avatars: anyone can update" on storage.objects;
drop policy if exists "avatars: anyone can delete" on storage.objects;
drop policy if exists "avatars: owner can upload" on storage.objects;
drop policy if exists "avatars: owner can update" on storage.objects;
drop policy if exists "avatars: owner can delete" on storage.objects;

create policy "avatars: owner can upload"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = (select id::text from public.players where auth_id = auth.uid() limit 1)
  );

create policy "avatars: owner can update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = (select id::text from public.players where auth_id = auth.uid() limit 1)
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select id::text from public.players where auth_id = auth.uid() limit 1)
  );

create policy "avatars: owner can delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = (select id::text from public.players where auth_id = auth.uid() limit 1)
  );
