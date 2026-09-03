begin;

do $$
declare
  updated_count integer;
begin
  with desired_order(person_id, family_id, position) as (
    values
      -- Магдан + Нургуль: Ажар, Дәулет
      ('db4f1297-921d-4446-a564-4e6cce72da78'::uuid,
        'family:c0c91629-590b-413e-a1e1-526007752f07|e1b0fb93-7486-44ea-ad38-f20a52d2fa58', 0),
      ('b103c54f-2308-4443-b290-83c9f630bd1b'::uuid,
        'family:c0c91629-590b-413e-a1e1-526007752f07|e1b0fb93-7486-44ea-ad38-f20a52d2fa58', 1),

      -- Ерсайын + Сара: Латипа, Еркінбек, Нургуль
      ('59ced859-a2bb-4fed-a9c7-0e940a0c77b7'::uuid,
        'family:660c7c97-a2bd-4036-8269-75126e2beefb|c9249391-b2c0-4984-82d0-afbceaed2ab9', 0),
      ('396dbdd4-7bf0-4aa1-beb5-d22367c3f293'::uuid,
        'family:660c7c97-a2bd-4036-8269-75126e2beefb|c9249391-b2c0-4984-82d0-afbceaed2ab9', 1),
      ('e1b0fb93-7486-44ea-ad38-f20a52d2fa58'::uuid,
        'family:660c7c97-a2bd-4036-8269-75126e2beefb|c9249391-b2c0-4984-82d0-afbceaed2ab9', 2),

      -- Қабдығали + Қауа: Магдан, Қабылқақ, Қайритен, Садритен
      ('c0c91629-590b-413e-a1e1-526007752f07'::uuid,
        'family:a0cb0ef1-b35a-4700-af60-a0c51dd428e0|e9a44ca1-11df-48ee-b8ae-8ef7e480af9d', 0),
      ('5ba30e82-c326-4ab3-9be0-ae5f6dfec65c'::uuid,
        'family:a0cb0ef1-b35a-4700-af60-a0c51dd428e0|e9a44ca1-11df-48ee-b8ae-8ef7e480af9d', 1),
      ('0469408b-22f7-4ce4-88cb-39c067f7206f'::uuid,
        'family:a0cb0ef1-b35a-4700-af60-a0c51dd428e0|e9a44ca1-11df-48ee-b8ae-8ef7e480af9d', 2),
      ('667cb496-fa0c-4fe4-88a0-76a3c27a191e'::uuid,
        'family:a0cb0ef1-b35a-4700-af60-a0c51dd428e0|e9a44ca1-11df-48ee-b8ae-8ef7e480af9d', 3)
  )
  update public.people as person
  set family_order = jsonb_set(
    coalesce(person.family_order, '{}'::jsonb),
    array[desired_order.family_id],
    to_jsonb(desired_order.position),
    true
  )
  from desired_order
  where person.id = desired_order.person_id;

  get diagnostics updated_count = row_count;
  if updated_count <> 9 then
    raise exception 'Expected to migrate 9 people, updated %', updated_count;
  end if;
end;
$$;

commit;
