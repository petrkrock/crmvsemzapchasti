// ============================================================
// EDGE FUNCTION: create-manager
// ============================================================
//
// Lets an admin, from inside the CRM (Настройки → Пользователи → Добавить),
// provision a real Supabase Auth login for a new manager — without this,
// the admin would have to leave the app and create the account by hand in
// the Supabase Dashboard every time (see README.md's older instructions).
//
// Why this has to be a server-side function at all: creating an arbitrary
// user's Auth account requires the service_role key, which must never be
// shipped to the browser (it bypasses every RLS policy in the project).
// This function holds that key server-side only, and only acts on it after
// independently verifying — using the CALLER's own JWT, not anything the
// client claims — that the caller is signed in AND has role = 'admin' in
// the profiles table.
//
// Deploy with the Supabase CLI (see README.md for the full walkthrough):
//   supabase functions deploy create-manager
//
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
// injected automatically by the platform into every Edge Function — no
// manual secret configuration needed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Не авторизован' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Scoped client using the CALLER's own JWT — respects RLS, so this can
    // only ever tell us who the caller actually is, never be spoofed.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) return json({ error: 'Не авторизован' }, 401);

    const { data: profile, error: profileErr } = await callerClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profileErr || !profile || profile.role !== 'admin') {
      return json({ error: 'Требуются права администратора' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';

    if (!email || !password) {
      return json({ error: 'email и password обязательны' }, 400);
    }
    if (password.length < 6) {
      return json({ error: 'Пароль должен быть не короче 6 символов' }, 400);
    }

    // Only now, after the admin check above, do we touch the service role key.
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // no email-verification step — an admin is vouching for this account
      user_metadata: { name },
    });
    if (createErr || !created?.user) {
      return json({ error: createErr?.message || 'Не удалось создать пользователя' }, 400);
    }

    // The on_auth_user_created trigger (see schema.sql) already inserts a
    // 'manager' profile row automatically — this update is just an
    // explicit, idempotent safety net in case that default ever changes.
    await adminClient.from('profiles').update({ role: 'manager' }).eq('id', created.user.id);

    return json({ id: created.user.id, email: created.user.email });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
