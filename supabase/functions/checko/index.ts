// Supabase Edge Function: checko
// Прокси к API Checko (https://checko.ru/integration/api) — лечит CORS для браузера.
// Деплой: supabase functions deploy checko --no-verify-jwt
// Вызов: POST { key, inn } → форвард на https://api.checko.ru/v2/company

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const { key, inn } = await req.json();
    if (!key || !inn) return json({ error: 'key и inn обязательны' }, 400);
    const resp = await fetch('https://api.checko.ru/v2/company', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, inn }),
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok || !data || data.status === 'error') {
      return json(data || { error: `Checko HTTP ${resp.status}` }, resp.ok ? 502 : resp.status);
    }
    return json(data);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
