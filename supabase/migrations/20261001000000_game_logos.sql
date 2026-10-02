-- =============================================================================
-- Game logos: a game tag can carry an uploaded logo image.
--
-- logo_url is the public URL of a 128px PNG in the game-logos bucket (the
-- browser shrinks the upload before sending it). Null draws the lookalike
-- icon in the game's colour, exactly as before. A card's legend copies the URL
-- when it is saved, so the board and History never read tags at play time.
-- =============================================================================

alter table public.tags add column logo_url text;

-- Public bucket, open like avatars: three friends, no adversary (decision 0002).
-- 1 MB is plenty for a 128px PNG and stops a full-size image slipping through.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('game-logos', 'game-logos', true, 1048576, array['image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "game-logos: public read"
  on storage.objects for select
  using (bucket_id = 'game-logos');

create policy "game-logos: anyone can upload"
  on storage.objects for insert
  with check (bucket_id = 'game-logos');

create policy "game-logos: anyone can update"
  on storage.objects for update
  using (bucket_id = 'game-logos');

create policy "game-logos: anyone can delete"
  on storage.objects for delete
  using (bucket_id = 'game-logos');
