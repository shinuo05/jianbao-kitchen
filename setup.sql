-- Run once in a NEW Supabase project's SQL Editor. One project = one family.
begin;
create table public.family_members (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.family_members enable row level security;
revoke all on public.family_members from anon, authenticated;
grant select on public.family_members to authenticated;
create policy member_self on public.family_members for select to authenticated
  using (user_id = (select auth.uid()));

create table public.kitchen_state (
  id integer primary key check (id = 1),
  body jsonb not null default '{"recipes":[],"pantry":[]}',
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.kitchen_state(id) values(1);
alter table public.kitchen_state enable row level security;
revoke all on public.kitchen_state from anon, authenticated;
grant select on public.kitchen_state to authenticated;
create policy family_read on public.kitchen_state for select to authenticated
  using (exists(select 1 from public.family_members where user_id = (select auth.uid())));

-- All writes go through this checked, atomic compare-and-swap function.
create function public.save_kitchen(expected_revision bigint, new_body jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare r jsonb; current_revision bigint;
begin
  if auth.uid() is null or not exists(select 1 from public.family_members where user_id=auth.uid()) then
    raise exception 'family_access_denied' using errcode='42501';
  end if;
  if jsonb_typeof(new_body) is distinct from 'object'
    or jsonb_typeof(new_body->'recipes') is distinct from 'array'
    or jsonb_typeof(new_body->'pantry') is distinct from 'array' then
    raise exception 'invalid_body';
  end if;
  if octet_length(new_body::text)>2000000 or jsonb_array_length(new_body->'recipes')>1000
    or jsonb_array_length(new_body->'pantry')>1000 then raise exception 'data_too_large'; end if;
  for r in select value from jsonb_array_elements(new_body->'recipes') loop
    if jsonb_typeof(r) is distinct from 'object'
      or jsonb_typeof(r->'id') is distinct from 'string' or length(trim(r->>'id')) not between 1 and 100
      or jsonb_typeof(r->'name') is distinct from 'string' or length(trim(r->>'name')) not between 1 and 60
      or coalesce(r->>'category','') not in ('荤菜','素菜','主食')
      or jsonb_typeof(r->'ingredients') is distinct from 'string' or length(trim(r->>'ingredients')) not between 1 and 10000
      or jsonb_typeof(r->'steps') is distinct from 'string' or length(r->>'steps')>30000
      or jsonb_typeof(r->'seasonings') is distinct from 'string' or length(r->>'seasonings')>2000
      or jsonb_typeof(r->'minutes') is distinct from 'number' then raise exception 'invalid_recipe'; end if;
    if (r->>'minutes')::numeric not between 1 and 999 then raise exception 'invalid_minutes'; end if;
    if r ? 'image' then raise exception 'use_image_path'; end if;
    if r ? 'imagePath' and (jsonb_typeof(r->'imagePath') is distinct from 'string'
      or (r->>'imagePath') !~ '^family/[a-f0-9-]{36}\.(jpg|png|webp)$') then raise exception 'invalid_image_path'; end if;
  end loop;
  if (select count(*) from jsonb_array_elements(new_body->'recipes')) <>
     (select count(distinct value->>'id') from jsonb_array_elements(new_body->'recipes')) then raise exception 'duplicate_id'; end if;
  for r in select value from jsonb_array_elements(new_body->'pantry') loop
    if jsonb_typeof(r) is distinct from 'string' or length(trim(r #>> '{}')) not between 1 and 100 then raise exception 'invalid_ingredient'; end if;
  end loop;
  select revision into current_revision from public.kitchen_state where id=1 for update;
  if expected_revision is null or current_revision<>expected_revision then raise exception 'revision_conflict'; end if;
  update public.kitchen_state set body=new_body,revision=revision+1,updated_at=now() where id=1 returning revision into current_revision;
  return current_revision;
end;
$$;
revoke all on function public.save_kitchen(bigint,jsonb) from public, anon;
grant execute on function public.save_kitchen(bigint,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('kitchen-images','kitchen-images',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy family_image_read on storage.objects for select to authenticated
using (bucket_id='kitchen-images' and exists(select 1 from public.family_members where user_id=(select auth.uid())));
create policy family_image_upload on storage.objects for insert to authenticated
with check (bucket_id='kitchen-images' and name ~ '^family/[a-f0-9-]{36}\.(jpg|png|webp)$'
  and exists(select 1 from public.family_members where user_id=(select auth.uid())));
-- No browser delete/overwrite permission: deleting a recipe keeps its old image for recovery.
commit;
