-- Two bugs surfaced while testing invite + fresh-signup flows:
--
-- 1. accept_household_invite's final UPDATE referenced the bare column name
--    "id", which collides with the function's own RETURNS TABLE output
--    parameter of the same name (PL/pgSQL implicitly declares those as
--    variables in scope) -- "column reference \"id\" is ambiguous", blocking
--    every invite acceptance.
--
-- 2. households has SELECT policies that query household_members directly,
--    and household_members's policies query households back -- a cross-table
--    RLS recursion loop ("infinite recursion detected in policy for relation
--    household_members"), surfacing on the very first household_members
--    insert during signup/household creation. It's unclear whether the
--    20260716_fix_rls_recursion.sql migration (which introduced the
--    my_household_ids() SECURITY DEFINER helper for exactly this class of
--    problem) was ever actually run against this database, so this file
--    redefines that helper and every policy that should use it from scratch
--    -- safe to run regardless of the current state, since everything here
--    is create-or-replace / drop-if-exists.

create or replace function public.my_household_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select household_id from public.household_members where user_id = auth.uid();
$$;

revoke all on function public.my_household_ids() from public;
grant execute on function public.my_household_ids() to authenticated;

-- household_members: see your own membership row, or any member row in a
-- household you belong to -- via the helper, so this never re-enters its
-- own policy.
drop policy if exists "household_members_select_own" on public.household_members;
create policy "household_members_select_own" on public.household_members
  for select
  using (
    user_id = auth.uid()
    or household_id in (select public.my_household_ids())
  );

-- invites: same helper, same reasoning.
drop policy if exists "invites_select_own_household" on public.invites;
create policy "invites_select_own_household" on public.invites
  for select
  using (
    created_by = auth.uid()
    or household_id in (select public.my_household_ids())
  );

drop policy if exists "invites_insert_own_household" on public.invites;
create policy "invites_insert_own_household" on public.invites
  for insert
  with check (
    created_by = auth.uid()
    and household_id in (select public.my_household_ids())
  );

-- households: collapse the two redundant SELECT policies into one, and route
-- its membership check through the same helper instead of a raw subquery on
-- household_members -- that raw subquery was the other half of the cycle.
drop policy if exists "households_select" on public.households;
drop policy if exists "members can view own household" on public.households;
create policy "households_select" on public.households
  for select
  using (
    auth.uid() = owner_id
    or id in (select public.my_household_ids())
  );

-- accept_household_invite: qualify the UPDATE's id column so it can't be
-- confused with the function's own RETURNS TABLE "id" output parameter.
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

  update public.invites set used_at = now() where public.invites.id = inv.id;

  return query select h.id, h.name, h.plan from public.households h where h.id = inv.household_id;
end;
$$;

revoke all on function public.accept_household_invite(text) from public;
grant execute on function public.accept_household_invite(text) to authenticated;
