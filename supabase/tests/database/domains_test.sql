-- v1.31.11: тесты изоляции доменов (pgTAP). Запуск: supabase test db
begin;
select plan(4);

-- Т1 (правка 4 — ключевой): authenticated БЕЗ клейма domain_id → 0 строк
select is((SELECT count(*) FROM suppliers), 0::bigint, 'без клейма → 0 строк (нет молчаливого фолбэка)');

-- Т2: дефолт-домен существует
select ok(exists(SELECT 1 FROM commerce.domains WHERE id = '00000000-0000-4000-8000-000000000001'), 'default-домен');

-- Т3: RPC возвращает поставщика с доменом
SELECT ok(
  (SELECT payload->'domain'->>'host' IS NOT NULL FROM public.get_supplier_with_domain(
    (SELECT service_access->>'token' FROM suppliers LIMIT 1)) LIMIT 1),
  'RPC: домен в ответе');

-- Т4: domain_id NOT NULL — INSERT без домена падает
select throws_ok(
  $$ INSERT INTO suppliers (trade_name, inn, status) VALUES ('__tap_dom__', '0000000000', 'ЛИД') $$,
  '23502');

select * from finish();
rollback;
