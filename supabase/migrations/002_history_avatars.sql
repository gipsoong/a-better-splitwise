-- Splitly: revision history + member avatars.
-- Run this once in Supabase > SQL Editor after 001_init.sql. Safe to re-run.
--
-- Every change the app makes now carries a small history entry (who, what, when, before/after).
-- It's stored in the same transaction as the change, through the same secret-keyed functions.

create table if not exists public.events (
  id       uuid primary key,
  group_id text not null references public.groups(id) on delete cascade,
  at       timestamptz not null default now(),
  data     jsonb not null
);
create index if not exists events_group_at_idx on public.events(group_id, at desc);
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;

-- Internal helper. Not callable from the browser.
create or replace function public._log_event(p_group text, p_event jsonb)
returns void language sql security definer set search_path = public as $$
  insert into events (id, group_id, at, data)
  select (p_event->>'id')::uuid, p_group, coalesce((p_event->>'at')::timestamptz, now()), p_event
  where p_event is not null and exists (select 1 from groups where id = p_group)
  on conflict (id) do nothing;
$$;
revoke execute on function public._log_event(text, jsonb) from public, anon, authenticated;

-- Replace the v1 functions with versions that also take the history entry.
drop function if exists public.create_group(text, text, text, jsonb, timestamptz);
drop function if exists public.update_group(text, text, text);
drop function if exists public.add_member(text, jsonb);
drop function if exists public.remove_member(text, text);
drop function if exists public.upsert_expense(text, jsonb);
drop function if exists public.delete_expense(text, uuid);

create or replace function public.get_group(p_id text)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'group', jsonb_build_object('id', g.id, 'name', g.name, 'currency', g.currency,
                                'members', g.members, 'createdAt', g.created_at),
    'expenses', coalesce((select jsonb_agg(e.data) from expenses e where e.group_id = g.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(x.data order by x.at) from (
                 select data, at from events where group_id = g.id order by at desc limit 500) x), '[]'::jsonb)
  )
  from groups g where g.id = p_id;
$$;

create or replace function public.create_group(p_id text, p_name text, p_currency text, p_members jsonb, p_created_at timestamptz, p_event jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into groups (id, name, currency, members, created_at)
  values (p_id, p_name, p_currency, p_members, coalesce(p_created_at, now()))
  on conflict (id) do nothing;
  perform _log_event(p_id, p_event);
end;
$$;

create or replace function public.update_group(p_id text, p_name text, p_currency text, p_event jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update groups set name = coalesce(p_name, name), currency = coalesce(p_currency, currency) where id = p_id;
  perform _log_event(p_id, p_event);
end;
$$;

create or replace function public.add_member(p_id text, p_member jsonb, p_event jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update groups set members = members || jsonb_build_array(p_member)
  where id = p_id
    and not exists (select 1 from jsonb_array_elements(members) m where m->>'id' = p_member->>'id');
  perform _log_event(p_id, p_event);
end;
$$;

create or replace function public.remove_member(p_id text, p_member_id text, p_event jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update groups set members = (
    select coalesce(jsonb_agg(case when m->>'id' = p_member_id then m || '{"removed": true}'::jsonb else m end), '[]'::jsonb)
    from jsonb_array_elements(members) m
  ) where id = p_id;
  perform _log_event(p_id, p_event);
end;
$$;

-- Change a member's emoji / colour (and later, name). Only these keys are accepted.
create or replace function public.update_member(p_id text, p_member_id text, p_patch jsonb, p_event jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare clean jsonb;
begin
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into clean
  from jsonb_each(p_patch) where key in ('emoji', 'color', 'name');
  update groups set members = (
    select coalesce(jsonb_agg(case when m->>'id' = p_member_id then m || clean else m end), '[]'::jsonb)
    from jsonb_array_elements(members) m
  ) where id = p_id;
  perform _log_event(p_id, p_event);
end;
$$;

create or replace function public.upsert_expense(p_group text, p_expense jsonb, p_event jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from groups where id = p_group) then
    raise exception 'group not found' using errcode = 'P0002';
  end if;
  insert into expenses (id, group_id, data, updated_at)
  values ((p_expense->>'id')::uuid, p_group, p_expense, now())
  on conflict (id) do update set data = excluded.data, updated_at = now()
  where expenses.group_id = p_group;
  perform _log_event(p_group, p_event);
end;
$$;

create or replace function public.delete_expense(p_group text, p_id uuid, p_event jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from expenses where id = p_id and group_id = p_group;
  perform _log_event(p_group, p_event);
end;
$$;

grant execute on function
  public.get_group(text),
  public.create_group(text, text, text, jsonb, timestamptz, jsonb),
  public.update_group(text, text, text, jsonb),
  public.add_member(text, jsonb, jsonb),
  public.remove_member(text, text, jsonb),
  public.update_member(text, text, jsonb, jsonb),
  public.upsert_expense(text, jsonb, jsonb),
  public.delete_expense(text, uuid, jsonb)
to anon, authenticated;

-- Tell the API to pick up the new function signatures right away.
notify pgrst, 'reload schema';
