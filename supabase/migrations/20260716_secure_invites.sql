-- The invites table had no effective RLS restriction: anon requests could read
-- every invite ever created (household_id + raw token) via the REST API directly,
-- bypassing the app's client-side used_at/expires_at checks entirely.
-- This locks down invites + household_members and moves invite acceptance into
-- a SECURITY DEFINER function so token validation happens in the database.

alter table public.invites enable row level security;
alter table public.household_members enable row level security;

-- Drop whatever policies currently exist (names unknown / possibly permissive)
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'invites' loop
    execute format('drop policy %I on public.invites', pol.policyname);
  end loop;
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'household_members' loop
    execute format('drop policy %I on public.household_members', pol.policyname);
  end loop;
end $$;

-- invites: only visible/creatable by someone who already belongs to that household
create policy "invites_select_own_household" on public.invites
  for select
  using (
    created_by = auth.uid()
    or household_id in (select household_id from public.household_members where user_id = auth.uid())
  );

create policy "invites_insert_own_household" on public.invites
  for insert
  with check (
    created_by = auth.uid()
    and household_id in (select household_id from public.household_members where user_id = auth.uid())
  );

-- No update/delete policy: only accept_household_invite() below may mark an invite used.

-- household_members: you can see your own membership, or others in a household you belong to
create policy "household_members_select_own" on public.household_members
  for select
  using (
    user_id = auth.uid()
    or household_id in (select household_id from public.household_members where user_id = auth.uid())
  );

-- Direct client inserts are only allowed for the "create my own household, become its owner" flow.
-- Joining an existing household as a member only happens via accept_household_invite() below.
create policy "household_members_insert_owner_self" on public.household_members
  for insert
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and household_id in (select id from public.households where owner_id = auth.uid())
  );

-- Validates the token (unused, not expired) and joins the household atomically,
-- server-side. SECURITY DEFINER (owned by postgres) bypasses RLS, so this is the
-- only path allowed to insert a 'member' row for someone else's household.
create or replace function public.accept_household_invite(p_token text)
returns table (id uuid, name text, plan text)
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
begin
  select * into inv from public.invites where token = p_token for update;

  if not found then
    raise exception 'Invalid invite link';
  end if;
  if inv.used_at is not null then
    raise exception 'This invite link has already been used';
  end if;
  if inv.expires_at < now() then
    raise exception 'This invite link has expired';
  end if;

  if not exists (
    select 1 from public.household_members
    where household_id = inv.household_id and user_id = auth.uid()
  ) then
    insert into public.household_members (household_id, user_id, role)
    values (inv.household_id, auth.uid(), 'member');
  end if;

  update public.invites set used_at = now() where id = inv.id;

  return query select h.id, h.name, h.plan from public.households h where h.id = inv.household_id;
end;
$$;

revoke all on function public.accept_household_invite(text) from public;
grant execute on function public.accept_household_invite(text) to authenticated;
