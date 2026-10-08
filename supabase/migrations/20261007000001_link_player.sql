-- Sign in with Discord: find a player by login, and hand an existing row to it.
--
-- Identity used to be a localStorage browser_id plus an anonymous auth session,
-- so every new PC, cleared cache or origin change (the Callout rename) made a
-- new players row and split everyone's stats. A Discord login is the same on
-- every machine, so once a row's auth_id is the Discord user, any browser that
-- signs in with Discord finds it (src/components/game/PlayerProvider.tsx).
--
-- Runs after 20261007000000_lock_down_public, which this builds on: browser_id
-- and claim_code are not readable on the table, and auth_id is write-once.

-- ── 1. My row, by login ─────────────────────────────────────────────────────

-- The login twin of get_my_player: the session's own auth.uid() proves the row
-- is yours, so the whole row comes back (claim_code included, for the profile).
-- Oldest first, in case two rows ever share a login before the unique index.
create or replace function public.get_login_player()
returns setof public.players
language sql
stable
security definer
set search_path = public
as $$
  select * from public.players
   where auth_id = auth.uid()
   order by created_at
   limit 1;
$$;

revoke all on function public.get_login_player() from public;
grant execute on function public.get_login_player() to authenticated;

-- ── 2. Handing a row to a login ─────────────────────────────────────────────

-- The browser cannot do the hand-over itself: "players: owner can update" only
-- lets the row's current auth_id change it, auth_id is write-once, and after
-- the rename most rows are owned by anonymous sessions nobody holds any more.
-- So this runs as definer, with its own guards instead of RLS:
--   1. the caller is signed in with a real (non-anonymous) account;
--   2. the caller does not own a row already (one player per login);
--   3. the row is not already owned by another real account, so a linked
--      player can never be taken. Rows owned by an anonymous session, by a
--      deleted user, or by nobody are fair game: that is the honor system the
--      claim code already ran on (decision 0002).
-- Returns false instead of raising when a guard refuses, so the app can fall
-- back to the claim-code / new-player prompt.
create or replace function public.link_player(p_player_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    return false;
  end if;

  if exists (select 1 from public.players where auth_id = caller) then
    return false;
  end if;

  update public.players p
     set auth_id = caller
   where p.id = p_player_id
     and not exists (
       select 1 from auth.users u
        where u.id = p.auth_id
          and not u.is_anonymous
     );

  return found;
end;
$$;

-- Only signed-in sessions may call it; the anon key alone gets nothing.
revoke all on function public.link_player(uuid) from public;
grant execute on function public.link_player(uuid) to authenticated;

-- ── 3. Write-once, except for link_player ───────────────────────────────────

-- The write-once rule exists so a CLIENT cannot write its own auth.uid() into
-- someone else's row. link_player is the one sanctioned re-point, and it runs
-- as the function owner, so the trigger now only refuses the API roles.
create or replace function public.players_auth_id_is_write_once()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.auth_id is not null
     and new.auth_id is distinct from old.auth_id
     and current_user in ('anon', 'authenticated') then
    raise exception 'players.auth_id is already set' using errcode = '42501';
  end if;
  return new;
end;
$$;
