-- Add Stripe customer ID to households so we can match webhooks back to users
ALTER TABLE households ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- Grandfather your own household (and your wife's shared one) as Pro
-- Run this BEFORE pushing the paywall code live.
-- Find your household ID in: Supabase → Table Editor → households
-- Then replace the placeholder below, or use the UPDATE based on owner email.

-- Option A — upgrade by owner email:
UPDATE households
SET plan = 'pro'
WHERE owner_id = (SELECT id FROM auth.users WHERE email = 'mattrogerson77@gmail.com');

-- Option B — upgrade all existing households (safe for now, new signups default to 'free'):
-- UPDATE households SET plan = 'pro';
