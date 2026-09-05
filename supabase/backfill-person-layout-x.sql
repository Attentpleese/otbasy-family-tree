-- One-time Stage 7 backfill for the 43-person production dataset.
-- Run this whole file as one query in Supabase SQL Editor.
--
-- Safety properties:
--   * locks public.people against concurrent inserts/updates/deletes;
--   * requires the exact 43 IDs captured by the approved dry-run;
--   * refuses to overwrite any existing layout_x value;
--   * updates all rows with one set-based UPDATE in one transaction;
--   * re-reads the rows and verifies max deviation below 0.001px.
--
-- Approved legacy-layout baseline SHA-256:
-- 893F2D4EBF2270B2ECAAD6E94415604167A2BDC269C9A71493671196392022D2

begin;

lock table public.people in share row exclusive mode;

create temporary table layout_x_backfill_payload (
  id uuid primary key,
  layout_x double precision not null
) on commit preserve rows;

insert into layout_x_backfill_payload (id, layout_x)
values
  ('006fd8fc-4b81-4cc0-b1bd-f1a22b2cb29b', 5112),
  ('01982d66-0490-443d-867e-a1d354544e20', 5522.285714285714),
  ('0469408b-22f7-4ce4-88cb-39c067f7206f', 600),
  ('11e3c03a-aae0-4412-be66-ccad822db2c9', 2400),
  ('1fa401c7-d9b8-49b4-a8e5-3197f0021029', 4584),
  ('20a3eec9-64f9-459f-b4e3-4a44b29e06cd', 2256),
  ('269be181-e719-4511-8ac0-b8d142381296', 1400),
  ('28955b6d-633c-4537-ac7e-ebd800ef94d6', 2712),
  ('2ee9de8f-a508-4c14-bd2e-553e5395416a', 1928),
  ('396dbdd4-7bf0-4aa1-beb5-d22367c3f293', 4312),
  ('4df12b1b-8e77-4931-b3d5-f22f9759fcca', 4994.285714285714),
  ('500ba128-3c40-4557-90e5-2ee6fd3bc108', 5896),
  ('54e6f9dd-f854-4a47-aa08-0892490cd1bb', 2456),
  ('59ced859-a2bb-4fed-a9c7-0e940a0c77b7', 3783.9999999999995),
  ('5ba30e82-c326-4ab3-9be0-ae5f6dfec65c', 72),
  ('5c5c5dae-062f-495e-8ad1-f44ab254a57f', 4039.9999999999995),
  ('643e2997-23f6-4611-b7b2-73bafaea12a8', 2000),
  ('660c7c97-a2bd-4036-8269-75126e2beefb', 4602.285714285714),
  ('667cb496-fa0c-4fe4-88a0-76a3c27a191e', 1128),
  ('6e28c5b2-a3c7-4eda-8d70-01992fc9bc17', 5130.285714285714),
  ('74c539b3-9aa5-4b4c-95e2-848af4531b7f', 1528),
  ('76ece1a2-c230-4c21-af19-448d6b959787', 2184),
  ('7d23d44d-fdf1-4203-8c01-74db4475d8d9', 2984),
  ('89be783b-e719-4da3-9684-4fc2e831f3b1', 2128),
  ('8a13de5a-f020-4745-99e9-83145781ddea', 5258.285714285714),
  ('a0cb0ef1-b35a-4700-af60-a0c51dd428e0', 1600),
  ('a14c63ca-f8b3-422b-868d-3746d7af9f49', 4840),
  ('a6744e29-bd74-4897-b753-15982313b8e2', 3776),
  ('b103c54f-2308-4443-b290-83c9f630bd1b', 3520),
  ('b974aee0-73dd-48e6-8483-b4f0a604f446', 328),
  ('b9abc823-26f3-4697-8096-2632615e7857', 5530.285714285714),
  ('bc96d88f-98fc-422b-b973-e7d1104bc9c4', 5368),
  ('be66fa75-0d4f-4904-a348-616617e68b37', 6168),
  ('c0c91629-590b-413e-a1e1-526007752f07', 3256),
  ('c54fcc38-5581-4fd0-bb33-b2373e06d52b', 5266.285714285714),
  ('c9249391-b2c0-4984-82d0-afbceaed2ab9', 4858.285714285714),
  ('cd020c7d-78e0-4deb-a2f4-89417de179ed', 5640),
  ('da17c7c3-22bb-4e81-82b2-15d422b45d89', 4738.285714285714),
  ('db4f1297-921d-4446-a564-4e6cce72da78', 3248),
  ('e1b0fb93-7486-44ea-ad38-f20a52d2fa58', 3511.9999999999995),
  ('e9a44ca1-11df-48ee-b8ae-8ef7e480af9d', 1856),
  ('eaa9c57f-35e5-426d-b612-16d1a47bca37', 856),
  ('ecc5caca-8f71-405c-92c6-d23b67bd29c0', 1656);

do $backfill$
declare
  people_count integer;
  payload_count integer;
  updated_count integer;
  maximum_deviation double precision;
begin
  select count(*) into people_count from public.people;
  select count(*) into payload_count from layout_x_backfill_payload;

  if people_count <> 43 or payload_count <> 43 then
    raise exception
      'Backfill aborted: expected 43 people and 43 payload rows, got % and %',
      people_count,
      payload_count;
  end if;

  if exists (
    select id from public.people
    except
    select id from layout_x_backfill_payload
  ) or exists (
    select id from layout_x_backfill_payload
    except
    select id from public.people
  ) then
    raise exception 'Backfill aborted: production IDs differ from the approved baseline';
  end if;

  if exists (select 1 from public.people where layout_x is not null) then
    raise exception 'Backfill aborted: at least one layout_x is already populated';
  end if;

  if exists (
    select 1
    from layout_x_backfill_payload
    where layout_x::text in ('NaN', 'Infinity', '-Infinity')
  ) then
    raise exception 'Backfill aborted: payload contains a non-finite X coordinate';
  end if;

  update public.people as person
  set layout_x = payload.layout_x
  from layout_x_backfill_payload as payload
  where person.id = payload.id;

  get diagnostics updated_count = row_count;

  if updated_count <> 43 then
    raise exception 'Backfill aborted: expected 43 updates, got %', updated_count;
  end if;

  select max(abs(person.layout_x - payload.layout_x))
  into maximum_deviation
  from public.people as person
  join layout_x_backfill_payload as payload using (id);

  if maximum_deviation is null or maximum_deviation >= 0.001 then
    raise exception
      'Backfill aborted: maximum persisted-X deviation is %px',
      maximum_deviation;
  end if;

  if exists (
    select 1
    from public.people
    where layout_x is null
       or layout_x::text in ('NaN', 'Infinity', '-Infinity')
  ) then
    raise exception 'Backfill aborted: persisted layout_x is missing or non-finite';
  end if;
end
$backfill$;

commit;

-- This final result is the success report. Any failed guard above rolls the
-- transaction back and prevents this query from returning a successful row.
select
  count(*)::integer as updated_rows,
  count(distinct person.id)::integer as unique_ids,
  count(distinct person.layout_x)::integer as unique_x,
  count(*) filter (where person.layout_x is null)::integer as missing_x,
  max(abs(person.layout_x - payload.layout_x)) as maximum_deviation_px,
  '893F2D4EBF2270B2ECAAD6E94415604167A2BDC269C9A71493671196392022D2'
    as approved_legacy_layout_sha256,
  'DA2FB93363FBE25C2918C685BFA3FA098D5218CD09D883884BBB7014F057DD7A'
    as approved_payload_sha256
from public.people as person
join layout_x_backfill_payload as payload using (id);
