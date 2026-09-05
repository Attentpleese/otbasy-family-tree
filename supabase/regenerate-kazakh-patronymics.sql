begin;

-- Returns a patronymic only when the child has exactly one known male parent
-- and a gender for which the Kazakh suffix is defined.
create or replace function public.generated_kazakh_patronymic(target_child_id uuid)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select case child.gender
    when 'male' then father.first_name || 'ұлы'
    when 'female' then father.first_name || 'қызы'
    else null
  end
  from public.people child
  cross join lateral (
    select max(candidate.first_name) as first_name
    from (
      select distinct parent.id, parent.first_name
      from public.relationships relationship
      join public.people parent on parent.id = relationship.parent_id
      where relationship.type = 'parent-child'
        and relationship.child_id = child.id
        and parent.gender = 'male'
    ) candidate
    having count(*) = 1
  ) father
  where child.id = target_child_id
    and nullif(btrim(father.first_name), '') is not null;
$$;

create or replace function public.refresh_kazakh_patronymic(target_child_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_patronymic text;
begin
  next_patronymic := public.generated_kazakh_patronymic(target_child_id);
  if next_patronymic is not null then
    update public.people
    set patronymic = next_patronymic
    where id = target_child_id
      and patronymic is distinct from next_patronymic;
  end if;
end;
$$;

create or replace function public.refresh_patronymics_after_parent_link()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.type = 'parent-child' then
    perform public.refresh_kazakh_patronymic(new.child_id);
  end if;
  if tg_op = 'UPDATE' then
    if old.type = 'parent-child'
      and (new.type <> 'parent-child' or new.child_id is distinct from old.child_id) then
      perform public.refresh_kazakh_patronymic(old.child_id);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.refresh_patronymics_after_person_identity_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  child_record record;
begin
  perform public.refresh_kazakh_patronymic(new.id);

  for child_record in
    select distinct relationship.child_id
    from public.relationships relationship
    where relationship.type = 'parent-child'
      and relationship.parent_id = new.id
  loop
    perform public.refresh_kazakh_patronymic(child_record.child_id);
  end loop;
  return new;
end;
$$;

-- Apply the reviewed dry-run payload exactly once as one batch update.
do $$
declare
  updated_count integer;
begin
  update public.people person
  set patronymic = approved.patronymic,
      gender = coalesce(approved.gender, person.gender)
  from (values
    ('b103c54f-2308-4443-b290-83c9f630bd1b'::uuid, null::public.person_gender, 'Магданұлы'),
    ('e1b0fb93-7486-44ea-ad38-f20a52d2fa58'::uuid, null::public.person_gender, 'Ерсайынқызы'),
    ('c0c91629-590b-413e-a1e1-526007752f07'::uuid, null::public.person_gender, 'Қабдығалиұлы'),
    ('a0cb0ef1-b35a-4700-af60-a0c51dd428e0'::uuid, null::public.person_gender, 'Жұманұлы'),
    ('e9a44ca1-11df-48ee-b8ae-8ef7e480af9d'::uuid, null::public.person_gender, 'Сабиқанқызы'),
    ('db4f1297-921d-4446-a564-4e6cce72da78'::uuid, null::public.person_gender, 'Магданқызы'),
    ('5ba30e82-c326-4ab3-9be0-ae5f6dfec65c'::uuid, null::public.person_gender, 'Қабдығалиұлы'),
    ('0469408b-22f7-4ce4-88cb-39c067f7206f'::uuid, null::public.person_gender, 'Қабдығалиұлы'),
    ('660c7c97-a2bd-4036-8269-75126e2beefb'::uuid, null::public.person_gender, 'Тұрарұлы'),
    ('59ced859-a2bb-4fed-a9c7-0e940a0c77b7'::uuid, null::public.person_gender, 'Ерсайынқызы'),
    ('396dbdd4-7bf0-4aa1-beb5-d22367c3f293'::uuid, null::public.person_gender, 'Ерсайынұлы'),
    ('667cb496-fa0c-4fe4-88a0-76a3c27a191e'::uuid, null::public.person_gender, 'Қабдығалиұлы'),
    ('269be181-e719-4511-8ac0-b8d142381296'::uuid, null::public.person_gender, 'Қабдығалиұлы'),
    ('2ee9de8f-a508-4c14-bd2e-553e5395416a'::uuid, null::public.person_gender, 'Қабдығалиұлы'),
    ('54e6f9dd-f854-4a47-aa08-0892490cd1bb'::uuid, null::public.person_gender, 'Қабдығалиқызы'),
    ('7d23d44d-fdf1-4203-8c01-74db4475d8d9'::uuid, null::public.person_gender, 'Қабдығалиқызы'),
    ('1fa401c7-d9b8-49b4-a8e5-3197f0021029'::uuid, null::public.person_gender, 'Ерсайынұлы'),
    ('006fd8fc-4b81-4cc0-b1bd-f1a22b2cb29b'::uuid, null::public.person_gender, 'Ерсайынқызы'),
    ('cd020c7d-78e0-4deb-a2f4-89417de179ed'::uuid, null::public.person_gender, 'Ерсайынұлы'),
    ('be66fa75-0d4f-4904-a348-616617e68b37'::uuid, null::public.person_gender, 'Ерсайынқызы'),
    ('89be783b-e719-4da3-9684-4fc2e831f3b1'::uuid, null::public.person_gender, 'Сабиқанұлы'),
    ('11e3c03a-aae0-4412-be66-ccad822db2c9'::uuid, null::public.person_gender, 'Сабиқанқызы'),
    ('8a13de5a-f020-4745-99e9-83145781ddea'::uuid, null::public.person_gender, 'Сәбитқызы'),
    ('74c539b3-9aa5-4b4c-95e2-848af4531b7f'::uuid, null::public.person_gender, 'Толегенқызы'),
    ('6e28c5b2-a3c7-4eda-8d70-01992fc9bc17'::uuid, null::public.person_gender, 'Тұрарқызы'),
    ('c9b258e8-2777-4baa-9c80-61e26ba343e3'::uuid, null::public.person_gender, 'Қабылқақұлы'),
    ('59227fc8-6e9c-4a39-af8c-73756bead9d0'::uuid, null::public.person_gender, 'Қабылқаққызы'),
    ('c894ca0b-a2f2-437a-ae5b-e6b227aac840'::uuid, null::public.person_gender, 'Еркінбекқызы'),
    ('8b7fbb91-8620-4b64-a281-22ebcec3d795'::uuid, null::public.person_gender, 'Еркінбекқызы'),
    ('5fb561b1-62b6-4df1-ad27-2261c9e02d61'::uuid, null::public.person_gender, 'Еслямбекұлы'),
    ('b9abc823-26f3-4697-8096-2632615e7857'::uuid, 'male'::public.person_gender, 'Сәбитұлы'),
    ('1bb79706-b68a-426b-9327-125a4519d83d'::uuid, 'male'::public.person_gender, 'Шанракбайұлы')
  ) approved(id, gender, patronymic)
  where person.id = approved.id;

  get diagnostics updated_count = row_count;
  if updated_count <> 32 then
    raise exception 'Expected to update 32 approved people, updated %', updated_count;
  end if;
end;
$$;

drop trigger if exists relationships_refresh_kazakh_patronymic on public.relationships;
create trigger relationships_refresh_kazakh_patronymic
after insert or update of type, parent_id, child_id on public.relationships
for each row execute function public.refresh_patronymics_after_parent_link();

drop trigger if exists people_refresh_kazakh_patronymics on public.people;
create trigger people_refresh_kazakh_patronymics
after update of first_name, gender on public.people
for each row
when (old.first_name is distinct from new.first_name or old.gender is distinct from new.gender)
execute function public.refresh_patronymics_after_person_identity_change();

commit;

-- Verification query: should return 32 rows and zero mismatches.
select
  count(*) as known_father_people,
  count(*) filter (
    where person.patronymic is distinct from public.generated_kazakh_patronymic(person.id)
  ) as mismatches
from public.people person
where public.generated_kazakh_patronymic(person.id) is not null;
