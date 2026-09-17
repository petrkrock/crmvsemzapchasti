-- ============================================================
-- ВСЕМЗАПЧАСТИ CRM — Supabase Schema
-- ============================================================
-- Выполнить целиком в Supabase SQL Editor после создания проекта.
-- Скрипт идемпотентный — его безопасно запускать повторно на уже
-- существующей базе (CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE
-- FUNCTION, пересоздание политик через DROP + CREATE).
--
-- Архитектура коротко:
--   - 5 основных таблиц (suppliers/buyers/tasks/tickets/media_records) —
--     нормализованные записи с собственными колонками.
--   - app_settings — одна строка (id='global') с настройками CRM в JSONB:
--     статусы, пользователи и их права, товарные группы, источники,
--     база знаний, публичные формы, журнал удалений и т.д. Это
--     сознательное архитектурное решение: всё, что администратор
--     настраивает через раздел «Настройки» в интерфейсе, физически
--     живёт в одном месте, без отдельной таблицы под каждый список.
--   - profiles — только роль (admin/manager) каждого пользователя
--     Supabase Auth, нужна исключительно для RLS-политик ниже (JSONB
--     нельзя проверить в политике напрямую).
--   - См. README.md — полный пошаговый гайд по установке.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── SUPPLIERS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type                TEXT NOT NULL,
  trade_name          TEXT NOT NULL,
  city                TEXT NOT NULL,
  address             TEXT,
  website             TEXT,
  inn                 TEXT,
  contact_role        TEXT,
  contact_name        TEXT NOT NULL,
  phone               TEXT NOT NULL,
  email               TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'В работе',
  source              TEXT,
  contact_pref        TEXT,
  warehouse_count     INTEGER DEFAULT 0,
  sku_count           INTEGER DEFAULT 0,
  warehouse_locations JSONB DEFAULT '[]',
  product_groups      TEXT[] DEFAULT '{}',
  own_brands          TEXT[] DEFAULT '{}',
  services            TEXT[] DEFAULT '{}',
  company_score       SMALLINT DEFAULT 5 CHECK (company_score >= 0 AND company_score <= 10),
  comment             TEXT,
  scoring             JSONB,
  requisites          JSONB,
  service_search      JSONB DEFAULT '[]',
  service_access      JSONB,
  history             JSONB DEFAULT '[]',
  additional_contacts TEXT,
  additional_comment  TEXT,
  from_api            BOOLEAN DEFAULT FALSE,
  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_city ON suppliers(city) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_inn ON suppliers(inn) WHERE deleted_at IS NULL;

-- Колонка для доступа поставщика к самообслуживанию (добавляется и для уже существующих баз)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS service_access JSONB;

-- ── BUYERS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS buyers (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type                TEXT NOT NULL,
  trade_name          TEXT NOT NULL,
  city                TEXT NOT NULL,
  address             TEXT,
  website             TEXT,
  inn                 TEXT,
  contact_role        TEXT,
  contact_name        TEXT NOT NULL,
  phone               TEXT NOT NULL,
  email               TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'В работе',
  source              TEXT,
  contact_pref        TEXT,
  location_count      INTEGER DEFAULT 0,
  company_score       SMALLINT DEFAULT 5 CHECK (company_score >= 0 AND company_score <= 10),
  comment             TEXT,
  scoring             JSONB,
  requisites          JSONB,
  history             JSONB DEFAULT '[]',
  additional_contacts TEXT,
  additional_comment  TEXT,
  from_api            BOOLEAN DEFAULT FALSE,
  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_buyers_status ON buyers(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_buyers_city ON buyers(city) WHERE deleted_at IS NULL;

-- ── TASKS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL DEFAULT 'none',
  entity_id   UUID,
  entity_name TEXT,
  title       TEXT NOT NULL,
  description TEXT,
  due_date    DATE NOT NULL,
  task_status TEXT NOT NULL DEFAULT 'Новая',
  completed   BOOLEAN DEFAULT FALSE,
  history     JSONB DEFAULT '[]',
  resolved_at TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ,
  priority    SMALLINT DEFAULT 3 CHECK (priority >= 0 AND priority <= 5),
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(task_status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_entity ON tasks(entity_type, entity_id);

-- История задач и дата решения (добавляются и на существующих базах)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS history JSONB DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ── TICKETS (ПОДДЕРЖКА) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type          TEXT NOT NULL DEFAULT 'Вопрос',
  category      TEXT,
  status        TEXT NOT NULL DEFAULT 'Новая',
  priority      SMALLINT DEFAULT 3 CHECK (priority >= 0 AND priority <= 5),
  subject       TEXT NOT NULL,
  text          TEXT NOT NULL,
  contact_name  TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  entity_type   TEXT,
  entity_id     UUID,
  history       JSONB DEFAULT '[]',
  from_api      BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status) WHERE deleted_at IS NULL;

-- Поддержка: способ связи, ссылка на созданную задачу, мягкое удаление (существующие базы)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS contact_pref TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS task_id TEXT;
-- Способы связи (мультивыбор): новая колонка-массив + разовая миграция старых текстовых значений
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_prefs JSONB DEFAULT '[]';
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS contact_prefs JSONB DEFAULT '[]';
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS locations_count INTEGER;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS contact_prefs JSONB DEFAULT '[]';
UPDATE suppliers SET contact_prefs = to_jsonb(ARRAY[contact_pref]) WHERE contact_prefs = '[]'::jsonb AND contact_pref IS NOT NULL AND contact_pref <> '';
UPDATE buyers SET contact_prefs = to_jsonb(ARRAY[contact_pref]) WHERE contact_prefs = '[]'::jsonb AND contact_pref IS NOT NULL AND contact_pref <> '';
UPDATE tickets SET contact_prefs = to_jsonb(ARRAY[contact_pref]) WHERE contact_prefs = '[]'::jsonb AND contact_pref IS NOT NULL AND contact_pref <> '';

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ── MEDIA RECORDS (МЕДИА СЕРВИС) ──────────────────────────
CREATE TABLE IF NOT EXISTS media_records (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id         UUID NOT NULL REFERENCES suppliers(id),
  supplier_name       TEXT NOT NULL,
  ad_type_id          TEXT NOT NULL,
  ad_type_name        TEXT NOT NULL,
  duration_option_id  TEXT,
  duration_label      TEXT,
  price_per_month     INTEGER DEFAULT 0,
  total_price         INTEGER DEFAULT 0,
  status              TEXT NOT NULL,
  start_date          DATE NOT NULL,
  end_date            DATE NOT NULL,
  notes               TEXT,
  expanded_notes      TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_media_status ON media_records(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_media_supplier ON media_records(supplier_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_media_end_date ON media_records(end_date) WHERE deleted_at IS NULL;

-- ── APP SETTINGS ───────────────────────────────────────────
-- Одна строка на весь проект (id = 'global'). settings — JSONB со всем,
-- что настраивается через раздел «Настройки»: statuses, users (роли и
-- права), productGroups, sources, supplierServices, taskEntityTypes,
-- mediaAdTypes, mediaStatuses, knowledgeItems, knowledgeCategories,
-- dbLogs (журнал удалений), forms (публичные формы для сайта) — состав
-- полностью описан типом AppSettings в src/types/index.ts.
CREATE TABLE IF NOT EXISTS app_settings (
  id         TEXT PRIMARY KEY DEFAULT 'global',
  settings   JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_settings (id, settings) VALUES ('global', '{}') ON CONFLICT DO NOTHING;

-- ── UPDATED_AT TRIGGER ────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON suppliers;
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_buyers_updated_at ON buyers;
CREATE TRIGGER trg_buyers_updated_at BEFORE UPDATE ON buyers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_tickets_updated_at ON tickets;
CREATE TRIGGER trg_tickets_updated_at BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_media_updated_at ON media_records;
CREATE TRIGGER trg_media_updated_at BEFORE UPDATE ON media_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── PROFILES (роль для RLS — admin/manager) ───────────────
-- Собственно имя/права по разделам хранятся в app_settings.settings.users
-- (JSONB, для удобства интерфейса Настроек) — но JSONB нельзя проверить
-- прямо в политике RLS. Эта маленькая таблица дублирует только роль
-- каждого пользователя Supabase Auth, специально для политик ниже.
-- Заполняется автоматически триггером при регистрации (роль 'manager' по
-- умолчанию) — первого администратора нужно назначить вручную, см. README.md.

CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'manager' CHECK (role IN ('admin', 'manager')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read profiles" ON profiles;
CREATE POLICY "Authenticated read profiles" ON profiles FOR SELECT USING (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'manager')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── ЗАЩИТА app_settings ОТ ПОВЫШЕНИЯ ПРАВ ─────────────────
-- app_settings.settings — это и админ-конфигурация, и то, что легитимно
-- редактирует любой авторизованный менеджер (например, базу знаний). RLS
-- умеет разрешать/запрещать UPDATE только на уровне всей строки целиком,
-- не по отдельным ключам JSON — поэтому "только admin" заблокировал бы
-- менеджерам сохранение их же правок, а "любой авторизованный" позволил
-- бы менеджеру в обход интерфейса отредактировать свою запись в
-- settings.users и выдать себе права администратора. Этот триггер
-- закрывает именно эту дыру, не блокируя ничего легитимного: не-админы
-- могут свободно обновлять строку, но поле `users` (роли и права) молча
-- принудительно возвращается к текущему серверному значению для всех,
-- кроме администратора — что бы клиент ни прислал.
CREATE OR REPLACE FUNCTION guard_app_settings_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT is_admin() THEN
    NEW.settings := jsonb_set(NEW.settings, '{users}', COALESCE(OLD.settings -> 'users', '[]'::jsonb));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_guard_app_settings ON app_settings;
CREATE TRIGGER trg_guard_app_settings
  BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION guard_app_settings_update();

-- ── REALTIME ───────────────────────────────────────────────
-- REPLICA IDENTITY FULL — события UPDATE/DELETE несут полную строку (а не
-- только первичный ключ), это нужно клиентским подпискам в
-- src/lib/supabase.ts, чтобы сразу правильно обновлять локальный кэш.
ALTER TABLE suppliers     REPLICA IDENTITY FULL;
ALTER TABLE buyers        REPLICA IDENTITY FULL;
ALTER TABLE tasks         REPLICA IDENTITY FULL;
ALTER TABLE tickets       REPLICA IDENTITY FULL;
ALTER TABLE media_records REPLICA IDENTITY FULL;
ALTER TABLE app_settings  REPLICA IDENTITY FULL;

-- Добавить таблицы в публикацию realtime (безопасно выполнять повторно —
-- если таблица уже добавлена или публикация настроена иначе, ошибка
-- просто игнорируется).
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE suppliers, buyers, tasks, tickets, media_records, app_settings';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ── USER ACCESS: серверные фильтры менеджеров (ТЗ «Управление пользователями») ──
-- Права дублируются из app_settings.settings.users (единый источник, защищён
-- guard_app_settings_update от правок не-админов) в таблицу user_access
-- триггером ниже — JSONB нельзя проверить напрямую в политике RLS.
-- Пустой массив = без ограничений по этому измерению.
CREATE TABLE IF NOT EXISTS user_access (
  user_id         TEXT PRIMARY KEY,  -- auth.users.id текстом (в demo-режиме id профиля может быть не UUID)
  supplier_types  TEXT[] NOT NULL DEFAULT '{}',
  supplier_cities TEXT[] NOT NULL DEFAULT '{}',
  buyer_types     TEXT[] NOT NULL DEFAULT '{}',
  buyer_cities    TEXT[] NOT NULL DEFAULT '{}',
  ticket_types    TEXT[] NOT NULL DEFAULT '{}',
  plan_cities     TEXT[] NOT NULL DEFAULT '{}'
);
ALTER TABLE user_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read user_access" ON user_access;
CREATE POLICY "Authenticated read user_access" ON user_access FOR SELECT USING (auth.role() = 'authenticated');

-- Активен ли сотрудник: blocked/fired не получают данные вообще (ТЗ п.1)
CREATE OR REPLACE FUNCTION is_active_employee() RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT COALESCE(u->>'status', 'active') = 'active'
    FROM public.app_settings s, jsonb_array_elements(s.settings->'users') u
    WHERE s.id = 'global' AND u->>'email' = (SELECT email FROM public.profiles WHERE id = auth.uid())), is_admin());
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Включён ли у менеджера раздел (permissions из settings.users)
CREATE OR REPLACE FUNCTION has_section_permission(p_section TEXT) RETURNS BOOLEAN AS $$
  SELECT COALESCE(bool_or(COALESCE((u->'permissions'->p_section)::bool, false)), false)
  FROM public.app_settings s, jsonb_array_elements(s.settings->'users') u
  WHERE s.id = 'global' AND u->>'email' = (SELECT email FROM public.profiles WHERE id = auth.uid());
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION access_supplier_types()  RETURNS TEXT[] AS $$ SELECT COALESCE((SELECT supplier_types  FROM public.user_access WHERE user_id = auth.uid()::text), '{}') $$ LANGUAGE sql STABLE SECURITY DEFINER;
CREATE OR REPLACE FUNCTION access_supplier_cities() RETURNS TEXT[] AS $$ SELECT COALESCE((SELECT supplier_cities FROM public.user_access WHERE user_id = auth.uid()::text), '{}') $$ LANGUAGE sql STABLE SECURITY DEFINER;
CREATE OR REPLACE FUNCTION access_buyer_types()     RETURNS TEXT[] AS $$ SELECT COALESCE((SELECT buyer_types     FROM public.user_access WHERE user_id = auth.uid()::text), '{}') $$ LANGUAGE sql STABLE SECURITY DEFINER;
CREATE OR REPLACE FUNCTION access_buyer_cities()    RETURNS TEXT[] AS $$ SELECT COALESCE((SELECT buyer_cities    FROM public.user_access WHERE user_id = auth.uid()::text), '{}') $$ LANGUAGE sql STABLE SECURITY DEFINER;
CREATE OR REPLACE FUNCTION access_ticket_types()    RETURNS TEXT[] AS $$ SELECT COALESCE((SELECT ticket_types    FROM public.user_access WHERE user_id = auth.uid()::text), '{}') $$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Пересборка user_access + синхронизация ролей в profiles при сохранении настроек
CREATE OR REPLACE FUNCTION sync_user_access() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.settings ? 'users' THEN
    UPDATE public.profiles p SET role = u->>'role'
    FROM jsonb_array_elements(NEW.settings->'users') u
    WHERE (p.id::text = (u->>'id') OR p.email = (u->>'email')) AND p.role IS DISTINCT FROM u->>'role';
    DELETE FROM public.user_access;
    INSERT INTO public.user_access (user_id, supplier_types, supplier_cities, buyer_types, buyer_cities, ticket_types, plan_cities)
      SELECT u->>'id',
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(u->'access'->'supplierTypes')),  '{}'),
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(u->'access'->'supplierCities')), '{}'),
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(u->'access'->'buyerTypes')),     '{}'),
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(u->'access'->'buyerCities')),    '{}'),
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(u->'access'->'ticketTypes')),    '{}'),
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(u->'access'->'planCities')),     '{}')
      FROM jsonb_array_elements(NEW.settings->'users') u
      WHERE u->>'role' = 'manager' AND COALESCE(u->>'status', 'active') = 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_sync_user_access ON app_settings;
CREATE TRIGGER trg_sync_user_access AFTER INSERT OR UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION sync_user_access();

-- Чтение suppliers/buyers/tickets с серверными фильтрами менеджера (ТЗ п.2).
-- План/Факт живёт внутри JSONB app_settings — погородной фильтр RLS там не
-- дать, он применяется на клиенте (canSeePlanCity в src/lib/auth.ts).
DROP POLICY IF EXISTS "Read suppliers by access" ON suppliers;
CREATE POLICY "Read suppliers by access" ON suppliers FOR SELECT USING (
  is_active_employee() AND (is_admin() OR (has_section_permission('suppliers')
    AND (cardinality(access_supplier_types())  = 0 OR type = ANY(access_supplier_types()))
    AND (cardinality(access_supplier_cities()) = 0 OR city = ANY(access_supplier_cities())))));
DROP POLICY IF EXISTS "Read buyers by access" ON buyers;
CREATE POLICY "Read buyers by access" ON buyers FOR SELECT USING (
  is_active_employee() AND (is_admin() OR (has_section_permission('buyers')
    AND (cardinality(access_buyer_types())  = 0 OR type = ANY(access_buyer_types()))
    AND (cardinality(access_buyer_cities()) = 0 OR city = ANY(access_buyer_cities())))));
DROP POLICY IF EXISTS "Read tickets by access" ON tickets;
CREATE POLICY "Read tickets by access" ON tickets FOR SELECT USING (
  is_active_employee() AND (is_admin() OR (has_section_permission('support')
    AND (cardinality(access_ticket_types()) = 0 OR type = ANY(access_ticket_types())))));

-- ── ROW LEVEL SECURITY ────────────────────────────────────

ALTER TABLE suppliers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings  ENABLE ROW LEVEL SECURITY;

-- Читать может любой авторизованный пользователь CRM
DROP POLICY IF EXISTS "Authenticated read tasks" ON tasks;
CREATE POLICY "Authenticated read tasks" ON tasks FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Authenticated read media" ON media_records;
CREATE POLICY "Authenticated read media" ON media_records FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Authenticated read settings" ON app_settings;
CREATE POLICY "Authenticated read settings" ON app_settings FOR SELECT USING (auth.role() = 'authenticated');

-- Создавать может любой авторизованный пользователь CRM
DROP POLICY IF EXISTS "Authenticated insert suppliers" ON suppliers;
CREATE POLICY "Authenticated insert suppliers" ON suppliers FOR INSERT WITH CHECK (is_active_employee() AND (is_admin() OR has_section_permission('suppliers')));
DROP POLICY IF EXISTS "Authenticated insert buyers" ON buyers;
CREATE POLICY "Authenticated insert buyers" ON buyers FOR INSERT WITH CHECK (is_active_employee() AND (is_admin() OR has_section_permission('buyers')));
DROP POLICY IF EXISTS "Authenticated insert tasks" ON tasks;
CREATE POLICY "Authenticated insert tasks" ON tasks FOR INSERT WITH CHECK (is_active_employee() AND (is_admin() OR has_section_permission('tasks')));
DROP POLICY IF EXISTS "Authenticated insert tickets" ON tickets;
CREATE POLICY "Authenticated insert tickets" ON tickets FOR INSERT WITH CHECK (is_active_employee() AND (is_admin() OR has_section_permission('support')));
DROP POLICY IF EXISTS "Authenticated insert media" ON media_records;
CREATE POLICY "Authenticated insert media" ON media_records FOR INSERT WITH CHECK (is_active_employee() AND (is_admin() OR has_section_permission('media')));

-- Редактировать может любой авторизованный пользователь CRM (менеджеры —
-- в рамках своих разделов, это уже проверяется на уровне интерфейса
-- приложения; в RLS разграничение по разделам не имеет смысла, т.к. все
-- пользователи CRM — сотрудники одной организации)
DROP POLICY IF EXISTS "Authenticated update suppliers" ON suppliers;
CREATE POLICY "Authenticated update suppliers" ON suppliers FOR UPDATE USING (is_active_employee());
DROP POLICY IF EXISTS "Authenticated update buyers" ON buyers;
CREATE POLICY "Authenticated update buyers" ON buyers FOR UPDATE USING (is_active_employee());
DROP POLICY IF EXISTS "Authenticated update tasks" ON tasks;
CREATE POLICY "Authenticated update tasks" ON tasks FOR UPDATE USING (is_active_employee());
DROP POLICY IF EXISTS "Authenticated update tickets" ON tickets;
CREATE POLICY "Authenticated update tickets" ON tickets FOR UPDATE USING (is_active_employee());
DROP POLICY IF EXISTS "Authenticated update media" ON media_records;
CREATE POLICY "Authenticated update media" ON media_records FOR UPDATE USING (is_active_employee());
-- app_settings: см. guard_app_settings_update() выше — политика широкая
-- намеренно, реальную защиту от повышения прав даёт триггер, не политика.
DROP POLICY IF EXISTS "Authenticated update settings" ON app_settings;
CREATE POLICY "Admin update settings" ON app_settings FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "Authenticated insert settings" ON app_settings;
CREATE POLICY "Authenticated insert settings" ON app_settings FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Удалять может только администратор — соответствует ограничению на
-- уровне интерфейса (кнопки удаления скрыты от менеджеров), но здесь это
-- гарантировано на уровне базы данных независимо от интерфейса.
DROP POLICY IF EXISTS "Admin delete suppliers" ON suppliers;
CREATE POLICY "Admin delete suppliers" ON suppliers FOR DELETE USING (is_admin());
DROP POLICY IF EXISTS "Admin delete buyers" ON buyers;
CREATE POLICY "Admin delete buyers" ON buyers FOR DELETE USING (is_admin());
DROP POLICY IF EXISTS "Admin delete tasks" ON tasks;
CREATE POLICY "Admin delete tasks" ON tasks FOR DELETE USING (is_admin());
DROP POLICY IF EXISTS "Admin delete tickets" ON tickets;
CREATE POLICY "Admin delete tickets" ON tickets FOR DELETE USING (is_admin());
DROP POLICY IF EXISTS "Admin delete media" ON media_records;
CREATE POLICY "Admin delete media" ON media_records FOR DELETE USING (is_admin());

-- ── STORAGE: ФАЙЛЫ БАЗЫ ЗНАНИЙ ────────────────────────────
-- Бакет "knowledge", используется uploadKnowledgeFile() в
-- src/lib/supabase.ts (Настройки → База знаний → тип «Файл»). Публичное
-- чтение (чтобы ссылки на файлы работали без подписанных URL), загрузка —
-- только авторизованным пользователям.
INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge', 'knowledge', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated upload to knowledge" ON storage.objects;
CREATE POLICY "Authenticated upload to knowledge"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'knowledge' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Public read knowledge files" ON storage.objects;
CREATE POLICY "Public read knowledge files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'knowledge');

DROP POLICY IF EXISTS "Authenticated delete knowledge files" ON storage.objects;
CREATE POLICY "Authenticated delete knowledge files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'knowledge' AND auth.role() = 'authenticated');

-- ── ОТВЕТСТВЕННЫЕ ВО ВСЕХ РАЗДЕЛАХ (ТЗ) ──
ALTER TABLE suppliers     ADD COLUMN IF NOT EXISTS responsible_id TEXT;
ALTER TABLE suppliers     ADD COLUMN IF NOT EXISTS responsible_name TEXT;
ALTER TABLE buyers        ADD COLUMN IF NOT EXISTS responsible_id TEXT;
ALTER TABLE buyers        ADD COLUMN IF NOT EXISTS responsible_name TEXT;
ALTER TABLE tasks         ADD COLUMN IF NOT EXISTS responsible_id TEXT;
ALTER TABLE tasks         ADD COLUMN IF NOT EXISTS responsible_name TEXT;
ALTER TABLE tickets       ADD COLUMN IF NOT EXISTS responsible_id TEXT;
ALTER TABLE tickets       ADD COLUMN IF NOT EXISTS responsible_name TEXT;
ALTER TABLE media_records ADD COLUMN IF NOT EXISTS responsible_id TEXT;
ALTER TABLE media_records ADD COLUMN IF NOT EXISTS responsible_name TEXT;


-- ════════════════════════════════════════════════════════════
-- SECURITY HOTFIX (релиз 1.0.1) — выполнить один раз после деплоя.
-- Блок идемпотентен: безопасно запускать повторно.
-- ════════════════════════════════════════════════════════════

-- 1) Row-level authorization: section + supplier/buyer type/city filters are
-- enforced by PostgreSQL, not only by the frontend. Soft-delete remains admin-only.
DROP POLICY IF EXISTS "Authenticated update suppliers" ON suppliers;
CREATE POLICY "Authenticated update suppliers" ON suppliers
  FOR UPDATE
  USING (
    is_active_employee() AND (is_admin() OR (
      has_section_permission('suppliers')
      AND (cardinality(access_supplier_types()) = 0 OR type = ANY(access_supplier_types()))
      AND (cardinality(access_supplier_cities()) = 0 OR city = ANY(access_supplier_cities()))
    ))
  )
  WITH CHECK (
    is_active_employee() AND (is_admin() OR (
      has_section_permission('suppliers')
      AND (deleted_at IS NULL)
      AND (cardinality(access_supplier_types()) = 0 OR type = ANY(access_supplier_types()))
      AND (cardinality(access_supplier_cities()) = 0 OR city = ANY(access_supplier_cities()))
    ))
  );
DROP POLICY IF EXISTS "Authenticated update buyers" ON buyers;
CREATE POLICY "Authenticated update buyers" ON buyers
  FOR UPDATE
  USING (
    is_active_employee() AND (is_admin() OR (
      has_section_permission('buyers')
      AND (cardinality(access_buyer_types()) = 0 OR type = ANY(access_buyer_types()))
      AND (cardinality(access_buyer_cities()) = 0 OR city = ANY(access_buyer_cities()))
    ))
  )
  WITH CHECK (
    is_active_employee() AND (is_admin() OR (
      has_section_permission('buyers')
      AND (deleted_at IS NULL)
      AND (cardinality(access_buyer_types()) = 0 OR type = ANY(access_buyer_types()))
      AND (cardinality(access_buyer_cities()) = 0 OR city = ANY(access_buyer_cities()))
    ))
  );
DROP POLICY IF EXISTS "Authenticated update tasks" ON tasks;
CREATE POLICY "Authenticated update tasks" ON tasks
  FOR UPDATE USING (is_active_employee() AND (is_admin() OR has_section_permission('tasks')))
  WITH CHECK (is_active_employee() AND (is_admin() OR (has_section_permission('tasks') AND deleted_at IS NULL)));
DROP POLICY IF EXISTS "Authenticated update tickets" ON tickets;
CREATE POLICY "Authenticated update tickets" ON tickets
  FOR UPDATE
  USING (is_active_employee() AND (is_admin() OR (
    has_section_permission('support')
    AND (cardinality(access_ticket_types()) = 0 OR type = ANY(access_ticket_types()))
  )))
  WITH CHECK (is_active_employee() AND (is_admin() OR (
    has_section_permission('support')
    AND deleted_at IS NULL
    AND (cardinality(access_ticket_types()) = 0 OR type = ANY(access_ticket_types()))
  )));
DROP POLICY IF EXISTS "Authenticated update media" ON media_records;
CREATE POLICY "Authenticated update media" ON media_records
  FOR UPDATE USING (is_active_employee() AND (is_admin() OR has_section_permission('media')))
  WITH CHECK (is_active_employee() AND (is_admin() OR (has_section_permission('media') AND deleted_at IS NULL)));

-- 2) INSERT в app_settings — только админ (раньше — любой авторизованный
--    мог вставить строку с произвольным id).
DROP POLICY IF EXISTS "Authenticated insert settings" ON app_settings;
CREATE POLICY "Admin insert settings" ON app_settings FOR INSERT WITH CHECK (is_admin());

-- 3) Триггер: не-админам фиксируем users / dbLogs / forms серверными
--    значениями — менеджер не может править роли, журнал удалений и
--    публичные формы в обход интерфейса.
CREATE OR REPLACE FUNCTION guard_app_settings_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT is_admin() THEN
    NEW.settings := jsonb_set(NEW.settings, '{users}',  COALESCE(OLD.settings -> 'users',  '[]'::jsonb));
    NEW.settings := jsonb_set(NEW.settings, '{dbLogs}', COALESCE(OLD.settings -> 'dbLogs', '[]'::jsonb));
    NEW.settings := jsonb_set(NEW.settings, '{forms}',  COALESCE(OLD.settings -> 'forms',  '[]'::jsonb));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) Одноразовая вырезка plaintext-паролей из уже существующей базы
--    (клиент теперь шлёт settings.users без поля password — sanitizeSettings
--    в src/lib/supabase.ts; этот UPDATE чистит то, что успело накопиться).
UPDATE app_settings
SET settings = jsonb_set(settings, '{users}',
  (SELECT jsonb_agg(u - 'password') FROM jsonb_array_elements(settings->'users') u))
WHERE id = 'global';

-- 5) Логирование ошибок приложения: писать может любой авторизованный
--    (иначе ошибка логина/сети не запишется), читать — только админ.
CREATE TABLE IF NOT EXISTS app_logs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level      TEXT NOT NULL DEFAULT 'error',
  message    TEXT NOT NULL,
  stack      TEXT,
  page       TEXT,
  user_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_logs_created ON app_logs(created_at DESC);
ALTER TABLE app_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated insert app_logs" ON app_logs;
CREATE POLICY "Authenticated insert app_logs" ON app_logs FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Admin read app_logs" ON app_logs;
CREATE POLICY "Admin read app_logs" ON app_logs FOR SELECT USING (is_admin());

-- Колонка функции «Мультисклад» (релиз 1.3.0)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS multi_warehouse BOOLEAN NOT NULL DEFAULT FALSE;

-- ════════════════════════════════════════════════════════════
-- РЕЛИЗ 1.5.0 — База лидов (новый раздел)
-- Лиды хранятся ВНУТРИ app_settings.settings.leads (JSONB) —
-- отдельная таблица не требуется: синхронизация, realtime-подписка
-- на app_settings и RLS-защита (guard_app_settings_update) работают
-- из коробки. Поля лида: id, type ('supplier'|'buyer'), tradeName,
-- city, contactName, status, phone, email, comment, createdAt,
-- createdBy, updatedAt, deletedAt (архив/дубли/найденные в базе).
-- Системные статусы лидов создаются клиентской миграцией
-- (DEFAULT_LEAD_STATUSES в src/constants/index.ts): ЛИД, Рассылка,
-- Обзвон, Найден в базе, Отписался, Архив дублей, АРХИВ.
-- Колонка multi_warehouse для поставщиков — см. блок выше.
-- ════════════════════════════════════════════════════════════
