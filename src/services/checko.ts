// ═══ Этап 1.8 — API скоринг поставщиков через Checko (https://checko.ru/integration/api) ═══
// Изолированный сервис: не меняет существующий код, экспортирует только чистые функции.
// API: POST https://api.checko.ru/v2/company  body: { key, inn }

import type { ScoreData } from '@/types';

/** Маржа = строка 1210 / строка 2110 × 100% */
export function calcMargin(inventory?: number, revenue?: number): number | undefined {
  if (!inventory || !revenue) return undefined;
  return Math.round((inventory / revenue) * 10000) / 100;
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v.replace(/\s/g, '')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}

import { getFunctionsUrl, getAnonKeyHeaders, isSupabaseConfigured } from '@/lib/functions-api';

/** Запрос компании по ИНН. Через Supabase Edge Function «checko» (прокси, лечит CORS),
 *  при отсутствии Supabase — прямой запрос (может блокироваться браузером по CORS). */
export async function fetchCheckoCompany(key: string, inn: string): Promise<ScoreData> {
  const viaProxy = isSupabaseConfigured();
  const resp = await fetch(viaProxy ? getFunctionsUrl('checko') : 'https://api.checko.ru/v2/company', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(viaProxy ? getAnonKeyHeaders() : {}) },
    body: JSON.stringify({ key, inn }),
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok || !json || json.status === 'error') {
    throw new Error(json?.error?.message || json?.error || `HTTP ${resp.status}`);
  }
  const data = json.data || json;
  const finances: Array<Record<string, unknown>> = data['Финансы'] || data.finances || [];
  const latest = [...finances].sort((a, b) => Number(b.year || 0) - Number(a.year || 0))[0] || {};
  const year = Number(latest.year) || new Date().getFullYear() - 1;
  const revenue = num(latest['2110']);       // Выручка
  const inventory = num(latest['1210']);     // Запасы
  const grossProfit = num(latest['2100']);   // Валовая прибыль
  const name = data['Наименование'] as { Полнное?: string; Сокращенное?: string } | undefined;
  return {
    year, revenue, inventory, grossProfit,
    marginPct: calcMargin(inventory, revenue),
    companyName: name?.Полнное || name?.Сокращенное || undefined,
    apiLoaded: true,
    apiLoadedAt: new Date().toISOString(),
  };
}
