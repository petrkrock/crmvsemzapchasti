-- v1.31.10: RLS-тесты (pgTAP). Запуск: supabase test db
begin;
select plan(4);

-- Тест 1: id поставщика нельзя изменить (триггер неизменяемости)
select throws_ok(
  $$ UPDATE suppliers SET id = gen_random_uuid() WHERE id = (SELECT id FROM suppliers LIMIT 1) $$,
  'P0001',
  '%id immutable%'
);

-- Тест 2: public_id автозаполняется триггером
select ok(
  exists(
    SELECT public_id FROM (
      INSERT INTO suppliers (trade_name, inn, status) VALUES ('__tap_test__', '0000000000', 'ЛИД') RETURNING public_id
    ) t WHERE public_id LIKE 'S%'
  ),
  'public_id auto-generated'
);

-- Тест 3: реестр содержит запись о выдаче ID
select ok(
  (SELECT count(*) FROM id_registry WHERE entity_type = 'supplier' AND issued_by IS NOT NULL) >= 1,
  'id_registry записал выдачу'
);

-- Тест 4: CHECK external_source — external_id без источника запрещён
select throws_ok(
  $$ INSERT INTO suppliers (trade_name, inn, status, external_id) VALUES ('__tap_chk__', '0000000000', 'ЛИД', 'DUP-1') $$,
  '23514'
);

select * from finish();
rollback;
