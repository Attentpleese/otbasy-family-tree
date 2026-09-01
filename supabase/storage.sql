-- Run this file once in Supabase Dashboard -> SQL Editor.
-- The bucket is public for portrait display; only authenticated editors can write.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'person-photos',
  'person-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Person photos are publicly readable" on storage.objects;
create policy "Person photos are publicly readable"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'person-photos');

drop policy if exists "Editors can upload person photos" on storage.objects;
create policy "Editors can upload person photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'person-photos');

drop policy if exists "Editors can update person photos" on storage.objects;
create policy "Editors can update person photos"
on storage.objects for update
to authenticated
using (bucket_id = 'person-photos')
with check (bucket_id = 'person-photos');

drop policy if exists "Editors can delete person photos" on storage.objects;
create policy "Editors can delete person photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'person-photos');
