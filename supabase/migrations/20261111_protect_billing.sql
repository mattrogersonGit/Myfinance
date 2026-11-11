-- Billing columns on households (plan, addons, stripe_customer_id) can only be
-- changed by the server: the Stripe webhook (service role) or the SQL editor.
-- The app itself can still rename a household, but a signed-in user calling
-- the API directly can no longer give themselves Pro or an add-on.
-- Make sure the columns exist (earlier migrations add them too).
alter table public.households add column if not exists stripe_customer_id text;
alter table public.households add column if not exists addons text[] not null default '{}';

create or replace function public.protect_household_billing()
returns trigger
language plpgsql
as $$
declare
  caller text := coalesce(auth.jwt() ->> 'role', '');
begin
  -- No JWT (SQL editor, migrations) or the service role: allowed.
  if caller not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.plan := 'free';
    new.addons := '{}';
    new.stripe_customer_id := null;
  else
    if new.plan is distinct from old.plan
       or new.addons is distinct from old.addons
       or new.stripe_customer_id is distinct from old.stripe_customer_id then
      raise exception 'Billing fields can only be changed by the server';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_household_billing on public.households;
create trigger protect_household_billing
  before insert or update on public.households
  for each row execute function public.protect_household_billing();
