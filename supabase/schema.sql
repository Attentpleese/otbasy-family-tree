create extension if not exists "pgcrypto";

create type public.person_gender as enum ('male', 'female', 'other');
create type public.relationship_type as enum ('parent-child', 'spouse', 'partner', 'divorced', 'sibling');

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  first_name text not null default '',
  last_name text not null default '',
  patronymic text,
  gender public.person_gender not null default 'other',
  birth_date date,
  death_date date,
  birth_date_precision text not null default 'day',
  death_date_precision text not null default 'day',
  birth_place text,
  clan text,
  family_order jsonb not null default '{}'::jsonb,
  family_layout_order integer,
  photo_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_life_dates_check check (
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
  ),
  constraint people_birth_date_precision_check check (birth_date_precision in ('day', 'month', 'year')),
  constraint people_death_date_precision_check check (death_date_precision in ('day', 'month', 'year'))
);

create table if not exists public.relationships (
  id uuid primary key default gen_random_uuid(),
  type public.relationship_type not null,
  parent_id uuid references public.people(id) on delete cascade,
  child_id uuid references public.people(id) on delete cascade,
  person_a_id uuid references public.people(id) on delete cascade,
  person_b_id uuid references public.people(id) on delete cascade,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint relationship_shape_check check (
    (
      type = 'parent-child'
      and parent_id is not null
      and child_id is not null
      and person_a_id is null
      and person_b_id is null
      and parent_id <> child_id
    )
    or
    (
      type in ('spouse', 'partner', 'divorced', 'sibling')
      and parent_id is null
      and child_id is null
      and person_a_id is not null
      and person_b_id is not null
      and person_a_id <> person_b_id
    )
  ),
  constraint relationship_dates_check check (end_date is null or start_date is null or end_date >= start_date)
);

create unique index if not exists relationships_parent_child_unique
  on public.relationships(parent_id, child_id)
  where type = 'parent-child';

create unique index if not exists relationships_pair_unique
  on public.relationships(least(person_a_id, person_b_id), greatest(person_a_id, person_b_id))
  where type in ('spouse', 'partner', 'divorced', 'sibling');

create index if not exists relationships_child_idx on public.relationships(child_id) where type = 'parent-child';
create index if not exists relationships_parent_idx on public.relationships(parent_id) where type = 'parent-child';

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
    birth_date_precision, death_date_precision,
    birth_place, clan, family_order, family_layout_order, photo_url, notes, created_at
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

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists people_touch_updated_at on public.people;
create trigger people_touch_updated_at
before update on public.people
for each row execute function public.touch_updated_at();

drop trigger if exists relationships_touch_updated_at on public.relationships;
create trigger relationships_touch_updated_at
before update on public.relationships
for each row execute function public.touch_updated_at();

create or replace function public.validate_relationship_rules()
returns trigger
language plpgsql
as $$
declare
  parent_count int;
  has_direct_parent_child boolean;
  has_cycle boolean;
begin
  if new.type = 'parent-child' then
    select count(*) into parent_count
    from public.relationships
    where type = 'parent-child'
      and child_id = new.child_id
      and id <> new.id;

    if parent_count >= 2 then
      raise exception 'A person can have no more than two biological parents.';
    end if;

    select exists (
      select 1
      from public.relationships
      where type in ('spouse', 'partner', 'divorced')
        and id <> new.id
        and (
          (person_a_id = new.parent_id and person_b_id = new.child_id)
          or (person_a_id = new.child_id and person_b_id = new.parent_id)
        )
    ) into has_direct_parent_child;

    if has_direct_parent_child then
      raise exception 'A spouse or partner cannot also be this person''s parent.';
    end if;

    with recursive descendants(id) as (
      select new.child_id
      union
      select r.child_id
      from public.relationships r
      join descendants d on d.id = r.parent_id
      where r.type = 'parent-child'
        and r.id <> new.id
    )
    select exists(select 1 from descendants where id = new.parent_id) into has_cycle;

    if has_cycle then
      raise exception 'Parent-child relationship would create an ancestry cycle.';
    end if;
  else
    select exists (
      select 1
      from public.relationships
      where type = 'parent-child'
        and id <> new.id
        and (
          (parent_id = new.person_a_id and child_id = new.person_b_id)
          or (parent_id = new.person_b_id and child_id = new.person_a_id)
        )
    ) into has_direct_parent_child;

    if has_direct_parent_child then
      raise exception 'A spouse or partner cannot also be this person''s parent.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists relationships_validate_rules on public.relationships;
create trigger relationships_validate_rules
before insert or update on public.relationships
for each row execute function public.validate_relationship_rules();

alter table public.people enable row level security;
alter table public.relationships enable row level security;

drop policy if exists "People are publicly readable" on public.people;
create policy "People are publicly readable"
on public.people for select
to anon, authenticated
using (true);

drop policy if exists "Relationships are publicly readable" on public.relationships;
create policy "Relationships are publicly readable"
on public.relationships for select
to anon, authenticated
using (true);

drop policy if exists "Editors can insert people" on public.people;
create policy "Editors can insert people"
on public.people for insert
to authenticated
with check (true);

drop policy if exists "Editors can update people" on public.people;
create policy "Editors can update people"
on public.people for update
to authenticated
using (true)
with check (true);

drop policy if exists "Editors can delete people" on public.people;
create policy "Editors can delete people"
on public.people for delete
to authenticated
using (true);

drop policy if exists "Editors can insert relationships" on public.relationships;
create policy "Editors can insert relationships"
on public.relationships for insert
to authenticated
with check (true);

drop policy if exists "Editors can update relationships" on public.relationships;
create policy "Editors can update relationships"
on public.relationships for update
to authenticated
using (true)
with check (true);

drop policy if exists "Editors can delete relationships" on public.relationships;
create policy "Editors can delete relationships"
on public.relationships for delete
to authenticated
using (true);
