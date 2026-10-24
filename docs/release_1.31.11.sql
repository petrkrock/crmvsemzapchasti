-- v1.31.11 — Домены: изоляция (мультитенантность). Идемпотентно, порядок обязателен.
-- 1. Домены + дефолт-арендатор
CREATE SCHEMA IF NOT EXISTS commerce;
CREATE TABLE IF NOT EXISTS commerce.domains (
  id UUID PRIMARY KEY, host TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '',
  title TEXT DEFAULT '', greeting TEXT DEFAULT '', banner_image TEXT DEFAULT '',
  banner_link TEXT DEFAULT '', is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
INSERT INTO commerce.domains (id, host, name)
  VALUES ('00000000-0000-4000-8000-000000000001', 'default', 'Основной домен')
  ON CONFLICT (id) DO NOTHING;
GRANT SELECT ON commerce.domains TO authenticated;

-- 2. Tenant-столбцы: добавить → backfill → NOT NULL (без DEFAULT!)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES commerce.domains(id);
ALTER TABLE buyers    ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES commerce.domains(id);
UPDATE suppliers SET domain_id = '00000000-0000-4000-8000-000000000001' WHERE domain_id IS NULL;
UPDATE buyers    SET domain_id = '00000000-0000-4000-8000-000000000001' WHERE domain_id IS NULL;
ALTER TABLE suppliers ALTER COLUMN domain_id SET NOT NULL;
ALTER TABLE buyers    ALTER COLUMN domain_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_domain ON suppliers(domain_id);
CREATE INDEX IF NOT EXISTS idx_buyers_domain ON buyers(domain_id);

-- 3. Функция домена (без молчаливого фолбэка; фолбэк — только admin)
CREATE OR REPLACE FUNCTION public.current_domain_id() RETURNS uuid AS $$
DECLARE v_claim uuid;
BEGIN
  v_claim := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'domain_id';
  IF v_claim IS NOT NULL THEN RETURN v_claim; END IF;
  IF public.is_admin() THEN RETURN '00000000-0000-4000-8000-000000000001'; END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 4. RPC для ЛК
CREATE OR REPLACE FUNCTION public.get_supplier_with_domain(p_token TEXT)
RETURNS TABLE (payload JSONB) AS $$
  SELECT to_jsonb(s) || jsonb_build_object('domain', to_jsonb(d))
  FROM public.suppliers s JOIN commerce.domains d ON d.id = s.domain_id
  WHERE s.service_access ->> 'token' = p_token AND (s.service_access ->> 'enabled')::boolean = true
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 5. Политики suppliers/buyers — пересоздать с условием домена
DROP POLICY IF EXISTS "Read suppliers by access" ON suppliers;
CREATE POLICY "Read suppliers by access" ON suppliers FOR SELECT TO authenticated
  USING ((SELECT is_active_employee()) AND deleted_at IS NULL
  AND (domain_id = (SELECT current_domain_id()) OR (SELECT is_admin())));
DROP POLICY IF EXISTS "Authenticated insert suppliers" ON suppliers;
CREATE POLICY "Authenticated insert suppliers" ON suppliers FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_active_employee())
  AND domain_id = (SELECT current_domain_id()));
DROP POLICY IF EXISTS "Authorized update suppliers" ON suppliers;
CREATE POLICY "Authorized update suppliers" ON suppliers FOR UPDATE TO authenticated
  USING ((SELECT is_active_employee())
  AND (domain_id = (SELECT current_domain_id()) OR (SELECT is_admin())));
DROP POLICY IF EXISTS "Read buyers by access" ON buyers;
CREATE POLICY "Read buyers by access" ON buyers FOR SELECT TO authenticated
  USING ((SELECT is_active_employee()) AND deleted_at IS NULL
  AND (domain_id = (SELECT current_domain_id()) OR (SELECT is_admin())));
DROP POLICY IF EXISTS "Authenticated insert buyers" ON buyers;
CREATE POLICY "Authenticated insert buyers" ON buyers FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_active_employee())
  AND domain_id = (SELECT current_domain_id()));
DROP POLICY IF EXISTS "Authorized update buyers" ON buyers;
CREATE POLICY "Authorized update buyers" ON buyers FOR UPDATE TO authenticated
  USING ((SELECT is_active_employee())
  AND (domain_id = (SELECT current_domain_id()) OR (SELECT is_admin())));

-- Тесты: supabase test db (supabase/tests/database/domains_test.sql)
-- Откат: политики — из schema.sql предыдущей версии; DROP COLUMN domain_id; таблицу domains оставить (пустую).
