begin;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'people'
      and column_name = 'maiden_name'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'people'
      and column_name = 'patronymic'
  ) then
    alter table public.people rename column maiden_name to patronymic;
  elsif not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'people'
      and column_name = 'patronymic'
  ) then
    alter table public.people add column patronymic text;
  end if;
end
$$;

-- The existing values are test data and should not become patronymics.
update public.people set patronymic = null;

alter table public.people drop column if exists maiden_name;

commit;
