-- ═══════════════════════════════════════════════════════════════════════════
-- v1.31.12 — Фиксы RLS: id_registry (42501 у менеджеров) + public.domains (кэш схем)
-- Порядок: этот SQL → сборка/выкладка фронта. Edge functions не тронуты.
-- Откат: пересоздать функции/политики из schema.sql v1.31.11 (в архиве релиза).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. id_registry: триггеры пишут в реестр с правами владельца ─────────────
-- Симптом: «new row violates row-level security policy for table id_registry» (42501)
-- при создании/удалении поставщика/покупателя менеджером (RLS реестра — SELECT-only admin).

CREATE OR REPLACE FUNCTION trg_suppliers_id_registry_bi() RETURNS trigger AS $$
BEGIN
  INSERT INTO id_registry (id, entity_type, entity_id, issued_by)
  VALUES (NEW.id, 'supplier', NEW.id, COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', 'system'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION trg_buyers_id_registry_bi() RETURNS trigger AS $$
BEGIN
  INSERT INTO id_registry (id, entity_type, entity_id, issued_by)
  VALUES (NEW.id, 'buyer', NEW.id, COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', 'system'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION trg_suppliers_id_registry_bd() RETURNS trigger AS $$
BEGIN
  UPDATE id_registry SET metadata = metadata || jsonb_build_object('deleted_at', now()) WHERE id = OLD.id;
  RETURN OLD;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION trg_buyers_id_registry_bd() RETURNS trigger AS $$
BEGIN
  UPDATE id_registry SET metadata = metadata || jsonb_build_object('deleted_at', now()) WHERE id = OLD.id;
  RETURN OLD;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 2. public.domains: прокси-вью для PostgREST ─────────────────────────────
-- Симптом: «Не удалось найти таблицу 'public.domains' в кэше схем» —
-- фронт шлёт FROM 'domains' без схемы, а таблица лежит в commerce (не exposed).
-- security_invoker: права вызывающего на базовой таблице (RLS ниже).

CREATE OR REPLACE VIEW public.domains WITH (security_invoker = on) AS
  SELECT * FROM commerce.domains;
GRANT SELECT, INSERT, UPDATE ON public.domains TO authenticated;

-- CRUD доменов — только admin (страница Настройки не имеет своего гейта).
ALTER TABLE commerce.domains ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS domains_admin_all ON commerce.domains;
CREATE POLICY domains_admin_all ON commerce.domains FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
GRANT INSERT, UPDATE ON commerce.domains TO authenticated;
