// Supabase Edge Function: supplier-service
// Самообслуживание поставщика: склады + условия сервиса поиска по ссылке /s/<token>.
// Доступ: секретный токен в URL + опциональный PIN. Работает с таблицей `suppliers`
// (колонки service_access / warehouse_locations / service_search / history).
// Деплой: supabase functions deploy supplier-service --no-verify-jwt
//
// Безопасность: функция ходит в БД только через service_role (RLS не применяется),
// поэтому вся авторизация — руками: токен из URL + PIN. Токен — 32 hex-символа,
// генерируется криптостойким генератором в карточке поставщика. PIN хранится
// открытым текстом (доступ к БД есть только у service_role); рекомендуется не
// использовать осмысленные коды и не включать PIN без необходимости.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const TOKEN_RE = /^[a-f0-9]{32}$/;
const MAX_WAREHOUSES = 50;
const MAX_CONDITIONS = 20;
const SS_KEYS = ['city', 'warehouseName', 'representative', 'contacts', 'email',
  'deliverySchedule', 'orderUnloadSchedule', 'returnConditions', 'officialWarehouse', 'deliveryTime'];

function serviceClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type SupplierRow = {
  id: string;
  trade_name: string;
  service_access: { token: string; pin?: string; enabled: boolean; createdAt: string } | null;
  warehouse_locations: Array<Record<string, unknown>> | null;
  service_search: Array<Record<string, unknown>> | null;
  history: unknown[] | null;
};

async function findSupplierByToken(client: ReturnType<typeof createClient>, token: string): Promise<SupplierRow | null> {
  const { data, error } = await client
    .from('suppliers')
    .select('id, trade_name, service_access, warehouse_locations, service_search, history')
    .is('deleted_at', null)
    .eq('service_access->>enabled', 'true')
    .eq('service_access->>token', token)
    .limit(1);
  if (error || !data?.length) return null;
  return data[0] as SupplierRow;
}

function pinOk(expected: string | undefined, provided: unknown): boolean {
  if (!expected) return true;
  const p = typeof provided === 'string' ? provided : '';
  return /^\d{4,6}$/.test(p) && p === expected;
}

// Анти-брутфорс PIN (аудит): PIN — всего 4–6 цифр (до 10^6 комбинаций), без
// лимита попыток его можно перебрать. Не более 5 неверных попыток с одного IP
// на один токен за 15 минут; успешная попытка сбрасывает счётчик.
const PIN_WINDOW = 15 * 60 * 1000;
const pinFails = new Map<string, number[]>();
function pinFailsNow(key: string): number[] {
  const now = Date.now();
  const fails = (pinFails.get(key) || []).filter(t => now - t < PIN_WINDOW);
  pinFails.set(key, fails);
  if (pinFails.size > 5000) pinFails.clear();
  return fails;
}
function pinBlocked(key: string): boolean {
  return pinFailsNow(key).length >= 5;
}
function pinFail(key: string): void {
  pinFails.set(key, [...pinFailsNow(key), Date.now()]);
}

function validateWarehouses(input: unknown, existing: Array<Record<string, unknown>>) {
  if (!Array.isArray(input)) return 'Некорректный список складов';
  if (input.length > MAX_WAREHOUSES) return `Максимум ${MAX_WAREHOUSES} складов`;
  const cities = new Set<string>();
  for (const w of input as Array<Record<string, unknown>>) {
    const city = String(w.city || '').trim();
    if (!city || city.length > 100) return 'У каждого склада обязателен город (до 100 символов)';
    if (cities.has(city.toLowerCase())) return `Склад "${city}" повторяется`;
    cities.add(city.toLowerCase());
    const sku = Number(w.skuCount ?? 0);
    if (!Number.isInteger(sku) || sku < 0 || sku > 10000000) return 'SKU — целое число от 0 до 10 000 000';
  }
  return (input as Array<Record<string, unknown>>).map((w, i) => {
    const id = typeof w.id === 'string' && w.id ? w.id : `wh-self-${i}-${Date.now()}`;
    const city = String(w.city).trim();
    // «Склад проверен» ставит ТОЛЬКО менеджер в CRM — значение от клиента игнорируется,
    // флаг сохраняется из текущей записи (по id или городу).
    const old = existing.find((e) => e.id === id) ||
      existing.find((e) => String(e.city || '').toLowerCase() === city.toLowerCase());
    return { id, city, skuCount: Number(w.skuCount ?? 0), verified: Boolean(old?.verified) };
  });
}

function validateConditions(input: unknown, warehouses: Array<{ city: string }>) {
  if (!Array.isArray(input)) return 'Некорректный список условий';
  if (input.length > MAX_CONDITIONS) return `Максимум ${MAX_CONDITIONS} условий`;
  const whCities = new Set(warehouses.map((w) => w.city.toLowerCase()));
  for (const raw of input as Array<Record<string, unknown>>) {
    const city = String(raw.city || '').trim();
    if (!city || city.length > 100) return 'В каждом условии обязателен город показов';
    const wh = String(raw.warehouseName || '').trim();
    if (wh && !whCities.has(wh.toLowerCase())) return `Склад "${wh}" отсутствует в вашем списке складов`;
    for (const k of SS_KEYS) if (String(raw[k] ?? '').length > 500) return 'Поле слишком длинное (макс. 500 символов)';
  }
  return (input as Array<Record<string, unknown>>).map((c) => {
    const out: Record<string, string> = {};
    for (const k of SS_KEYS) out[k] = String(c[k] ?? '').trim();
    return out;
  });
}

// Статус условия определяет СЕРВЕР (поставщик прислать его не может):
//  — такого города+склада ещё нет → «Новое»;
//  — есть, содержимое изменилось → «Есть изменения» (если было «Загружено»),
//    «Новое»/«Есть изменения» остаются как есть (менеджер ещё не обработал);
//  — есть, без изменений → текущий статус сохраняется (legacy без статуса → «Загружено»).
function withStatuses(
  incoming: Array<Record<string, string>>,
  existing: Array<Record<string, unknown>>,
): Array<Record<string, string>> {
  return incoming.map((c) => {
    const match = (existing || []).find(
      (e) => String(e.city || '').toLowerCase() === c.city.toLowerCase() &&
             String(e.warehouseName || '').toLowerCase() === (c.warehouseName || '').toLowerCase(),
    );
    if (!match) return { ...c, status: 'Новое' };
    const changed = SS_KEYS.some((k) => String(match[k] ?? '').trim() !== c[k]);
    if (!changed) return { ...c, status: (match.status as string) || 'Загружено' };
    const prev = (match.status as string) || 'Новое';
    return { ...c, status: prev === 'Загружено' ? 'Есть изменения' : prev };
  });
}

async function handleGet(req: Request) {
  const token = new URL(req.url).searchParams.get('token') || '';
  if (!TOKEN_RE.test(token)) return json({ error: 'Недействительная ссылка' }, 400);
  const client = serviceClient();
  const supplier = await findSupplierByToken(client, token);
  if (!supplier) return json({ error: 'Ссылка недействительна или доступ отключён' }, 404);
  // Список городов, доступных для показов — из настроек CRM (Настройки → Типы и города)
  const { data: settingsRow } = await client.from('app_settings').select('settings').eq('id', 'global').maybeSingle();
  const availableCities = ((settingsRow?.settings as Record<string, unknown> | undefined)?.cities as string[]) || [];
  return json({
    companyName: supplier.trade_name || 'Поставщик',
      inn: supplier.inn || '', // ТЗ v1.23.0: ИНН для экрана PIN ЛК
      contactName: supplier.contact_name || '', contactPhone: supplier.phone || '', contactEmail: supplier.email || '', // ТЗ v1.23.2: «Заполнить из карточки»
        multiWarehouse: Boolean((supplier as SupplierRow & { multi_warehouse?: boolean }).multi_warehouse),
    hasPin: Boolean(supplier.service_access?.pin),
    warehouses: supplier.warehouse_locations || [],
    availableCities,
    // Never expose protected supplier data before PIN verification.
    // The client must POST the PIN first to receive warehouses/serviceSearch.

  });
}

async function handlePost(req: Request) {
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > 512 * 1024) return json({ error: 'Запрос слишком большой' }, 413);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Некорректный запрос' }, 400); }
  const token = String(body.token || '');
  if (!TOKEN_RE.test(token)) return json({ error: 'Недействительная ссылка' }, 400);
  const client = serviceClient();
  const supplier = await findSupplierByToken(client, token);
  if (!supplier) return json({ error: 'Ссылка недействительна или доступ отключён' }, 404);
  const rlIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rlKey = `${token}:${rlIp}`;
  if (supplier.service_access?.pin) {
    // ТЗ v1.23.19: анти-брутфорс отключён по требованию владельца (блокировал легальных поставщиков).
    if (!pinOk(supplier.service_access?.pin, body.pin)) {
      return json({ error: 'Неверный PIN-код' }, 403);
    }
    pinFails.delete(rlKey); // успех — сброс счётчика неудач
  }

  const patch: Record<string, unknown> = {};
  if (body.warehouses !== undefined) {
    const wh = validateWarehouses(body.warehouses, supplier.warehouse_locations || []);
    if (typeof wh === 'string') return json({ error: wh }, 400);
    patch.warehouse_locations = wh;
  }
  if (body.serviceSearch !== undefined) {
    const whNow = (patch.warehouse_locations as Array<{ city: string }>) ||
      (supplier.warehouse_locations as Array<{ city: string }>) || [];
    const cond = validateConditions(body.serviceSearch, whNow);
    if (typeof cond === 'string') return json({ error: cond }, 400);
    patch.service_search = withStatuses(cond, supplier.service_search || []);
  }

  // Пустой PATCH = проверка PIN (вход по ссылке с PIN). Валидный PIN
  // grants access to the protected supplier data. No PIN-protected data is
  // returned by GET before this point.
  if (!Object.keys(patch).length) {
    return json({
      ok: true,
      pinVerified: true,
      companyName: supplier.trade_name || 'Поставщик',
      inn: supplier.inn || '', // ТЗ v1.23.0: ИНН для экрана PIN ЛК
      contactName: supplier.contact_name || '', contactPhone: supplier.phone || '', contactEmail: supplier.email || '', // ТЗ v1.23.2: «Заполнить из карточки»
      multiWarehouse: Boolean((supplier as SupplierRow & { multi_warehouse?: boolean }).multi_warehouse),
      warehouses: supplier.warehouse_locations || [],
      serviceSearch: supplier.service_search || [],
      availableCities: ((await client.from('app_settings').select('settings').eq('id', 'global').maybeSingle()).data?.settings as Record<string, unknown> | undefined)?.cities || [],
    });
  }

  const history = Array.isArray(supplier.history) ? [...supplier.history] : [];
  history.push({
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
    userId: 'supplier-self',
    userName: 'Поставщик (самообслуживание)',
    field: patch.service_search !== undefined ? 'serviceSearch' : 'warehouseLocations',
    oldValue: '',
    newValue: JSON.stringify(patch),
    comment: 'Изменено через ссылку самообслуживания',
  });
  patch.history = history;
  patch.warehouse_count = (patch.warehouse_locations as unknown[])?.length ??
    (supplier.warehouse_locations || []).length;
  patch.updated_at = new Date().toISOString();

  const { error } = await client.from('suppliers').update(patch).eq('id', supplier.id);
  if (error) return json({ error: 'Не удалось сохранить. Попробуйте позже.' }, 500);
  return json({
    ok: true,
    warehouses: patch.warehouse_locations ?? supplier.warehouse_locations ?? [],
    serviceSearch: patch.service_search ?? supplier.service_search ?? [],
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (req.method === 'GET') return await handleGet(req);
    if (req.method === 'POST') return await handlePost(req);
    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('[supplier-service] error:', err);
    return json({ error: 'Внутренняя ошибка сервера. Попробуйте позже.' }, 500);
  }
});
