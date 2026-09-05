-- Run this file once in Supabase Dashboard -> SQL Editor.
-- Stage 2 keeps the bucket public until signed URLs are introduced in Stage 4.
-- Object policies require authentication for reads and the editor role for writes.

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
drop policy if exists "Authenticated users can read person photos" on storage.objects;
create policy "Authenticated users can read person photos"
on storage.objects for select
to authenticated
using (bucket_id = 'person-photos');

drop policy if exists "Editors can upload person photos" on storage.objects;
create policy "Editors can upload person photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'person-photos'
  and public.is_family_editor()
);

drop policy if exists "Editors can update person photos" on storage.objects;
create policy "Editors can update person photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'person-photos'
  and public.is_family_editor()
)
with check (
  bucket_id = 'person-photos'
  and public.is_family_editor()
);

drop policy if exists "Editors can delete person photos" on storage.objects;
create policy "Editors can delete person photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'person-photos'
  and public.is_family_editor()
);
