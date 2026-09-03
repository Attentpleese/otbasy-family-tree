alter table public.people
  add column if not exists birth_date_precision text not null default 'day',
  add column if not exists death_date_precision text not null default 'day';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'people_birth_date_precision_check'
      and conrelid = 'public.people'::regclass
  ) then
    alter table public.people
      add constraint people_birth_date_precision_check
      check (birth_date_precision in ('day', 'month', 'year'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'people_death_date_precision_check'
      and conrelid = 'public.people'::regclass
  ) then
    alter table public.people
      add constraint people_death_date_precision_check
      check (death_date_precision in ('day', 'month', 'year'));
  end if;
end
$$;

alter table public.people drop constraint if exists people_life_dates_check;
alter table public.people
  add constraint people_life_dates_check check (
    death_date is null or birth_date is null
    or extract(year from death_date) > extract(year from birth_date)
    or (
      extract(year from death_date) = extract(year from birth_date)
      and (
        birth_date_precision = 'year' or death_date_precision = 'year'
        or extract(month from death_date) > extract(month from birth_date)
        or (
          extract(month from death_date) = extract(month from birth_date)
          and (
            birth_date_precision = 'month' or death_date_precision = 'month'
            or death_date >= birth_date
          )
        )
      )
    )
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
  insert into public.people (
    id, first_name, last_name, patronymic, gender, birth_date, death_date,
    birth_date_precision, death_date_precision, birth_place, clan, family_order,
    family_layout_order,
    photo_url, notes, created_at
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
