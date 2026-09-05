-- Stage 2: require authentication for reads and the editor app role for writes.
--
-- IMPORTANT: do not apply this migration until the viewer-auth client from
-- Stage 3 is ready for the coordinated cutover. The current public client reads
-- as anon and would temporarily stop loading the tree after this migration.

begin;

create or replace function public.is_family_editor()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'app_role', '') = 'editor';
$$;

revoke all on function public.is_family_editor() from public;
grant execute on function public.is_family_editor() to authenticated;

drop policy if exists "People are publicly readable" on public.people;
drop policy if exists "Authenticated users can read people" on public.people;
create policy "Authenticated users can read people"
on public.people for select
to authenticated
using (true);

drop policy if exists "Relationships are publicly readable" on public.relationships;
drop policy if exists "Authenticated users can read relationships" on public.relationships;
create policy "Authenticated users can read relationships"
on public.relationships for select
to authenticated
using (true);

drop policy if exists "Editors can insert people" on public.people;
create policy "Editors can insert people"
on public.people for insert
to authenticated
with check (public.is_family_editor());

drop policy if exists "Editors can update people" on public.people;
create policy "Editors can update people"
on public.people for update
to authenticated
using (public.is_family_editor())
with check (public.is_family_editor());

drop policy if exists "Editors can delete people" on public.people;
create policy "Editors can delete people"
on public.people for delete
to authenticated
using (public.is_family_editor());

drop policy if exists "Editors can insert relationships" on public.relationships;
create policy "Editors can insert relationships"
on public.relationships for insert
to authenticated
with check (public.is_family_editor());

drop policy if exists "Editors can update relationships" on public.relationships;
create policy "Editors can update relationships"
on public.relationships for update
to authenticated
using (public.is_family_editor())
with check (public.is_family_editor());

drop policy if exists "Editors can delete relationships" on public.relationships;
create policy "Editors can delete relationships"
on public.relationships for delete
to authenticated
using (public.is_family_editor());

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

create or replace function public.add_family_graph_members(
  people_payload jsonb,
  relationships_payload jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_family_editor() then
    raise exception 'Editor role required' using errcode = '42501';
  end if;

  insert into public.people (
    id, first_name, last_name, patronymic, gender, birth_date, death_date,
    birth_date_precision, death_date_precision,
    birth_place, clan, family_order, family_layout_order, layout_x, photo_url, notes, created_at
  )
  select
    (item->>'id')::uuid,
    coalesce(item->>'first_name', ''),
    coalesce(item->>'last_name', ''),
    nullif(item->>'patronymic', ''),
    coalesce(item->>'gender', 'other')::public.person_gender,
    nullif(item->>'birth_date', '')::date,
    nullif(item->>'death_date', '')::date,
    coalesce(nullif(item->>'birth_date_precision', ''), 'day'),
    coalesce(nullif(item->>'death_date_precision', ''), 'day'),
    nullif(item->>'birth_place', ''),
    nullif(item->>'clan', ''),
    coalesce(item->'family_order', '{}'::jsonb),
    nullif(item->>'family_layout_order', '')::integer,
    nullif(item->>'layout_x', '')::double precision,
    nullif(item->>'photo_url', ''),
    nullif(item->>'notes', ''),
    coalesce(nullif(item->>'created_at', '')::timestamptz, now())
  from jsonb_array_elements(coalesce(people_payload, '[]'::jsonb)) as item;

  insert into public.relationships (
    id, type, parent_id, child_id, person_a_id, person_b_id, start_date, end_date
  )
  select
    (item->>'id')::uuid,
    (item->>'type')::public.relationship_type,
    nullif(item->>'parent_id', '')::uuid,
    nullif(item->>'child_id', '')::uuid,
    nullif(item->>'person_a_id', '')::uuid,
    nullif(item->>'person_b_id', '')::uuid,
    nullif(item->>'start_date', '')::date,
    nullif(item->>'end_date', '')::date
  from jsonb_array_elements(coalesce(relationships_payload, '[]'::jsonb)) as item;
end;
$$;

revoke all on function public.add_family_graph_members(jsonb, jsonb) from public;
grant execute on function public.add_family_graph_members(jsonb, jsonb) to authenticated;

commit;

-- Verification: these should return only the policies created above.
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where (schemaname = 'public' and tablename in ('people', 'relationships'))
   or (schemaname = 'storage' and tablename = 'objects'
       and policyname ilike '%person photo%')
order by schemaname, tablename, policyname;
