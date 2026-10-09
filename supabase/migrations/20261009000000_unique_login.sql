-- One player per login.
--
-- Sign-in with Discord is now the only way in (decision 0007), so a login and
-- a player are the same thing. link_player already refuses a caller who owns a
-- row; this makes the database itself refuse a second row for one auth_id, so
-- no bug or race can bring back the duplicate players the browser-id era made.
-- Partial: rows nobody owns yet (auth_id null) are not duplicates of each other.
create unique index if not exists players_auth_id_unique
  on public.players (auth_id)
  where auth_id is not null;
