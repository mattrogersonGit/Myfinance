-- Fixes 42P17 "infinite recursion detected in policy for relation household_members"
-- introduced by 20260716_secure_invites.sql: its household_members SELECT policy
-- queried household_members from within its own policy, which re-triggers that
-- same policy recursively. invites' policies hit the same recursion indirectly,
-- since they subquery household_members too.
--
-- Fix: look up the caller's household ids via a SECURITY DEFINER function, which
-- bypasses RLS instead of re-entering it.

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

drop policy if exists "household_members_select_own" on public.household_members;
create policy "household_members_select_own" on public.household_members
  for select
  using (
    user_id = auth.uid()
    or household_id in (select public.my_household_ids())
  );

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
