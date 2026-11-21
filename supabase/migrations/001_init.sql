-- Splitly schema. Paste this whole file into Supabase > SQL Editor and click Run.
--
-- Security model: the browser only has the public "anon" key, so tables have RLS on
-- and NO policies. Nothing can be read or written directly. All access goes through
-- the functions below, which require the group's id. The id is a long random secret
-- that only exists in the share link, so knowing the link is what grants access.

create table if not exists public.groups (
  id         text primary key check (length(id) >= 20),
  name       text not null,
  currency   text not null default 'SGD',
  members    jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id         uuid primary key,
  group_id   text not null references public.groups(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists expenses_group_idx on public.expenses(group_id);

alter table public.groups   enable row level security;
alter table public.expenses enable row level security;
revoke all on public.groups, public.expenses from anon, authenticated;

-- Read a whole group with its expenses. Returns null if the id doesn't exist.
create or replace function public.get_group(p_id text)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'group', jsonb_build_object('id', g.id, 'name', g.name, 'currency', g.currency,
                                'members', g.members, 'createdAt', g.created_at),
    'expenses', coalesce((select jsonb_agg(e.data) from expenses e where e.group_id = g.id), '[]'::jsonb)
  )
  from groups g where g.id = p_id;
$$;

create or replace function public.create_group(p_id text, p_name text, p_currency text, p_members jsonb, p_created_at timestamptz)
returns void language sql security definer set search_path = public as $$
  insert into groups (id, name, currency, members, created_at)
  values (p_id, p_name, p_currency, p_members, coalesce(p_created_at, now()))
  on conflict (id) do nothing;
$$;

create or replace function public.update_group(p_id text, p_name text, p_currency text)
returns void language sql security definer set search_path = public as $$
  update groups set name = coalesce(p_name, name), currency = coalesce(p_currency, currency)
  where id = p_id;
$$;

-- Members are appended one at a time so two people joining at once don't overwrite each other.
create or replace function public.add_member(p_id text, p_member jsonb)
returns void language sql security definer set search_path = public as $$
  update groups set members = members || jsonb_build_array(p_member)
  where id = p_id
    and not exists (select 1 from jsonb_array_elements(members) m where m->>'id' = p_member->>'id');
$$;

-- Removing a member only hides them, so old expenses still show their name.
create or replace function public.remove_member(p_id text, p_member_id text)
returns void language sql security definer set search_path = public as $$
  update groups set members = (
    select coalesce(jsonb_agg(case when m->>'id' = p_member_id then m || '{"removed": true}'::jsonb else m end), '[]'::jsonb)
    from jsonb_array_elements(members) m
  ) where id = p_id;
$$;

create or replace function public.upsert_expense(p_group text, p_expense jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from groups where id = p_group) then
    raise exception 'group not found' using errcode = 'P0002';
  end if;
  insert into expenses (id, group_id, data, updated_at)
  values ((p_expense->>'id')::uuid, p_group, p_expense, now())
  on conflict (id) do update set data = excluded.data, updated_at = now()
  where expenses.group_id = p_group;
end;
$$;

create or replace function public.delete_expense(p_group text, p_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from expenses where id = p_id and group_id = p_group;
$$;

create or replace function public.delete_group(p_id text)
returns void language sql security definer set search_path = public as $$
  delete from groups where id = p_id;
$$;

grant execute on function
  public.get_group(text),
  public.create_group(text, text, text, jsonb, timestamptz),
  public.update_group(text, text, text),
  public.add_member(text, jsonb),
  public.remove_member(text, text),
  public.upsert_expense(text, jsonb),
  public.delete_expense(text, uuid),
  public.delete_group(text)
to anon, authenticated;
