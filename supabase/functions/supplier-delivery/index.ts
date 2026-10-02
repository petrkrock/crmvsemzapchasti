// Supabase Edge Function: supplier-delivery  (ТЗ v1.29.0)
// ЧИСТЫЙ ЛК сервиса доставки (DBO) по ссылке /d/<token>: проверка токена + PIN.
// Хранилище — только delivery_access (JSONB) в таблице suppliers.
// Данных/складов/условий в кабинете пока нет — функционал появится позже.
// Деплой: supabase functions deploy supplier-delivery --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const pinOk = (stored?: string, given?: string) => !stored || (given ?? '') === stored;

// Анти-брутфорс PIN: не более 5 попыток на токен
const attempts = new Map<string, { count: number; resetAt: number }>();
const ATTEMPT_LIMIT = 5;
const WINDOW_MS = 15 * 60 * 1000;

function bruteBlocked(token: string): boolean {
  const now = Date.now();
  const rec = attempts.get(token);
  if (!rec || rec.resetAt < now) { attempts.delete(token); return false; }
  return rec.count >= ATTEMPT_LIMIT;
}
function registerFail(token: string) {
  const now = Date.now();
  const rec = attempts.get(token);
  if (!rec || rec.resetAt < now) attempts.set(token, { count: 1, resetAt: now + WINDOW_MS });
  else rec.count += 1;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token') || '';
    if (!token) return json({ error: 'Недействительная ссылка' }, 404);

    const client = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: supplier, error } = await client.from('suppliers')
      .select('id, trade_name, delivery_access')
      .eq('delivery_access->>token', token)
      .eq('delivery_access->>enabled', 'true')
      .maybeSingle();
    if (error || !supplier) return json({ error: 'Ссылка недействительна или доступ отключён' }, 404);

    const access = supplier.delivery_access || {};
    const hasPin = Boolean(access.pin);

    // GET — мета-данные кабинета (без защищённых данных)
    if (req.method === 'GET') {
      return json({ companyName: supplier.trade_name, hasPin });
    }

    // POST — проверка PIN (пустое тело = ping)
    if (req.method === 'POST') {
      if (bruteBlocked(token)) return json({ error: 'Слишком много попыток. Попробуйте позже.' }, 429);
      const body = await req.json().catch(() => ({}));
      if (!pinOk(access.pin, body?.pin)) { registerFail(token); return json({ error: 'Неверный PIN-код' }, 403); }
      attempts.delete(token);
      return json({ ok: true, companyName: supplier.trade_name });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error('[supplier-delivery] error:', e);
    return json({ error: 'Внутренняя ошибка сервера' }, 500);
  }
});
