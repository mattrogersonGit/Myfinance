// Permanently deletes the calling user's login and, if they're the last
// member of their household, the entire household's data. Must run with the
// service-role key (auth.admin.deleteUser and bypassing RLS for the cascade
// aren't possible from the browser with the anon key), so this can only be
// invoked as a Supabase Edge Function, never called directly from the client
// with elevated privileges of its own.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  // Identify the caller from their own access token -- never trust a user id
  // passed in the request body.
  const authHeader = req.headers.get('Authorization') || '';
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: corsHeaders });
  }
  const userId = userData.user.id;

  // Service-role client: bypasses RLS for the cleanup, and is the only way to
  // delete an auth.users row at all.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const { data: membership, error: memErr } = await admin
      .from('household_members')
      .select('household_id, role')
      .eq('user_id', userId)
      .maybeSingle();
    if (memErr) throw memErr;

    if (membership) {
      const householdId = membership.household_id;
      const { count, error: countErr } = await admin
        .from('household_members')
        .select('*', { count: 'exact', head: true })
        .eq('household_id', householdId);
      if (countErr) throw countErr;

      if ((count ?? 0) <= 1) {
        // Sole member -- wipe the whole household's data.
        await admin.from('household_data').delete().eq('household_id', householdId);
        await admin.from('invites').delete().eq('household_id', householdId);
        await admin.from('household_members').delete().eq('household_id', householdId);
        await admin.from('households').delete().eq('id', householdId);
      } else {
        // Other members remain -- just leave. If the leaving member owned the
        // household, hand ownership to whichever other member is left so the
        // household still has one.
        await admin.from('household_members').delete().eq('household_id', householdId).eq('user_id', userId);
        if (membership.role === 'owner') {
          const { data: successor } = await admin
            .from('household_members')
            .select('user_id')
            .eq('household_id', householdId)
            .limit(1)
            .maybeSingle();
          if (successor) {
            await admin.from('household_members').update({ role: 'owner' }).eq('household_id', householdId).eq('user_id', successor.user_id);
            await admin.from('households').update({ owner_id: successor.user_id }).eq('id', householdId);
          }
        }
      }
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) throw delErr;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('delete-account:', err);
    return new Response(JSON.stringify({ error: err.message || 'Delete failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
