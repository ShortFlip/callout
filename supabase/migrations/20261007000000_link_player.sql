-- Sign in with Discord: hand an existing player row to the signed-in Discord user.
--
-- Identity used to be a localStorage browser_id plus an anonymous auth session,
-- so every new PC, cleared cache or origin change (the Callout rename) made a
-- new players row and split everyone's stats. A Discord login is the same on
-- every machine, so once a row's auth_id is the Discord user, any browser that
-- signs in with Discord finds it (src/components/game/PlayerProvider.tsx).
--
-- The browser cannot do the hand-over itself: "players: owner can update" only
-- lets the row's current auth_id change it, and after the rename most rows are
-- owned by anonymous sessions nobody holds any more. So this runs as definer,
-- with its own guards instead of RLS:
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
-- Pinned so a caller cannot shadow public.players or auth.users.
set search_path = ''
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
revoke execute on function public.link_player(uuid) from public, anon;
grant execute on function public.link_player(uuid) to authenticated;
