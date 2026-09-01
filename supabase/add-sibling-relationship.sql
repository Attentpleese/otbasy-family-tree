-- Run this migration once for an existing Family Tree database.
-- COMMIT makes the new enum value available to the following constraints.
alter type public.relationship_type add value if not exists 'sibling';
commit;

alter table public.relationships
  drop constraint if exists relationship_shape_check;

alter table public.relationships
  add constraint relationship_shape_check check (
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
  );

drop index if exists public.relationships_pair_unique;
create unique index relationships_pair_unique
  on public.relationships(least(person_a_id, person_b_id), greatest(person_a_id, person_b_id))
  where type in ('spouse', 'partner', 'divorced', 'sibling');
