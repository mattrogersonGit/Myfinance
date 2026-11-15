// Akahu test connection (Personal App, read-only). Beta / test only.
//
// A Personal App's tokens belong to ONE Akahu login, so they live only in this
// function's secrets, never in the app's source (the repo is public) and never
// in the browser. Only households with the 'akahu' add-on can call it; the
// add-on is set by hand in SQL (see supabase/migrations/20261116_akahu_test.sql)
// and the billing trigger stops browsers from setting it themselves.
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   AKAHU_APP_TOKEN   App ID Token      (my.akahu.nz -> Developers)
//   AKAHU_USER_TOKEN  User Access Token (my.akahu.nz -> Developers)
//
// Actions (POST JSON { action, ... }), each a single Akahu GET except refresh:
//   me            -> GET /me
//   accounts      -> GET /accounts
//   transactions  -> GET /accounts/{accountId}/transactions?start&end&cursor (one page of up to 100)
//   pending       -> GET /accounts/{accountId}/transactions/pending
//   refresh       -> POST /refresh (Akahu ignores it inside its rest period)
// Nothing is stored server-side; the app only displays what comes back.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AKAHU_APP_TOKEN = Deno.env.get('AKAHU_APP_TOKEN') || '';
const AKAHU_USER_TOKEN = Deno.env.get('AKAHU_USER_TOKEN') || '';
const AKAHU = 'https://api.akahu.io/v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const ACCOUNT_ID = /^acc_[a-z0-9]{10,40}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[0-9:.]+(Z|[+-]\d{2}:\d{2})?)?$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!AKAHU_APP_TOKEN || !AKAHU_USER_TOKEN) return json({ error: 'Akahu tokens are not set on the server' }, 500);

  // Who is calling -- from their own sign-in token, never from the body.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'Not signed in' }, 401);

  // Their household must have the 'akahu' add-on.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: member } = await admin
    .from('household_members').select('household_id').eq('user_id', userData.user.id).maybeSingle();
  if (!member) return json({ error: 'No household' }, 403);
  const { data: hh } = await admin.from('households').select('addons').eq('id', member.household_id).maybeSingle();
  if (!Array.isArray(hh?.addons) || !hh.addons.includes('akahu')) return json({ error: 'Not enabled for this household' }, 403);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { return json({ error: 'Bad request' }, 400); }
  const action = String(body.action || '');
  const accountId = String(body.accountId || '');
  if (['transactions', 'pending'].includes(action) && !ACCOUNT_ID.test(accountId)) return json({ error: 'Bad account id' }, 400);

  let path = '';
  let method = 'GET';
  if (action === 'me') path = '/me';
  else if (action === 'accounts') path = '/accounts';
  else if (action === 'pending') path = `/accounts/${accountId}/transactions/pending`;
  else if (action === 'refresh') { path = '/refresh'; method = 'POST'; }
  else if (action === 'transactions') {
    const q = new URLSearchParams();
    for (const k of ['start', 'end']) {
      const v = body[k];
      if (v == null || v === '') continue;
      if (!ISO_DATE.test(String(v))) return json({ error: `Bad ${k} date` }, 400);
      q.set(k, String(v));
    }
    if (body.cursor) {
      const c = String(body.cursor);
      if (c.length > 2000 || /[\s&?#]/.test(c)) return json({ error: 'Bad cursor' }, 400);
      q.set('cursor', c);
    }
    path = `/accounts/${accountId}/transactions${q.toString() ? '?' + q : ''}`;
  } else return json({ error: 'Unknown action' }, 400);

  try {
    const res = await fetch(AKAHU + path, {
      method,
      headers: { Authorization: `Bearer ${AKAHU_USER_TOKEN}`, 'X-Akahu-Id': AKAHU_APP_TOKEN, Accept: 'application/json' },
    });
    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch (_) { data = { success: false, message: text.slice(0, 300) }; }
    return json({ status: res.status, data }, res.ok ? 200 : 502);
  } catch (err) {
    console.error('akahu:', err);
    return json({ error: 'Could not reach Akahu' }, 502);
  }
});
