alter table public.people
add column if not exists family_order jsonb not null default '{}'::jsonb;
