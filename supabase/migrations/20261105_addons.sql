-- Paid/beta add-on modules per household (e.g. 'property'), separate from
-- households.plan ('free' / 'pro') so a module can be enabled on its own.
ALTER TABLE households ADD COLUMN IF NOT EXISTS addons text[] NOT NULL DEFAULT '{}';

-- Enable the Property module beta for a household. Find the household id in
-- Supabase -> Table Editor -> households, then run:
--
--   UPDATE households
--   SET addons = array_append(addons, 'property')
--   WHERE id = '<household-id>' AND NOT ('property' = ANY(addons));
