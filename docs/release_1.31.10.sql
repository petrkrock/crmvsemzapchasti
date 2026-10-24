-- v1.31.10 — релизный SQL для прода (идемпотентно, порядок обязателен)
CREATE SCHEMA IF NOT EXISTS commerce;
GRANT USAGE ON SCHEMA commerce TO authenticated, anon;

ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS chk_suppliers_external;
ALTER TABLE suppliers ADD CONSTRAINT chk_suppliers_external CHECK (external_id IS NULL OR external_source IS NOT NULL);
ALTER TABLE buyers DROP CONSTRAINT IF EXISTS chk_buyers_external;
ALTER TABLE buyers ADD CONSTRAINT chk_buyers_external CHECK (external_id IS NULL OR external_source IS NOT NULL);

-- Политики RLS с (SELECT fn())
DROP POLICY IF EXISTS "id_registry_select_admin" ON id_registry;
CREATE POLICY id_registry_select_admin ON id_registry FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid() OR (SELECT is_admin()));

DROP POLICY IF EXISTS "Users read own access" ON public.user_access;
CREATE POLICY "Users read own access" ON public.user_access
FOR SELECT TO authenticated
USING ((SELECT is_admin()) OR user_id = auth.uid()::text);

DROP POLICY IF EXISTS "Read suppliers by access" ON public.suppliers;
CREATE POLICY "Read suppliers by access" ON public.suppliers
FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND (SELECT is_active_employee())
  AND (
    (SELECT is_admin())
    OR (
      (SELECT has_section_permission('suppliers'))
      AND (cardinality((SELECT access_supplier_types())) = 0 OR type = ANY((SELECT access_supplier_types())))
      AND (cardinality((SELECT access_supplier_cities())) = 0 OR city = ANY((SELECT access_supplier_cities())))
    )
  )
);

DROP POLICY IF EXISTS "Read buyers by access" ON public.buyers;
CREATE POLICY "Read buyers by access" ON public.buyers
FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND (SELECT is_active_employee())
  AND (
    (SELECT is_admin())
    OR (
      (SELECT has_section_permission('buyers'))
      AND (cardinality((SELECT access_buyer_types())) = 0 OR type = ANY((SELECT access_buyer_types())))
      AND (cardinality((SELECT access_buyer_cities())) = 0 OR city = ANY((SELECT access_buyer_cities())))
    )
  )
);

DROP POLICY IF EXISTS "Read tasks by access" ON public.tasks;
CREATE POLICY "Read tasks by access" ON public.tasks
FOR SELECT TO authenticated
USING (deleted_at IS NULL AND (SELECT is_active_employee()) AND ((SELECT is_admin()) OR (SELECT has_section_permission('tasks'))));

DROP POLICY IF EXISTS "Read tickets by access" ON public.tickets;
CREATE POLICY "Read tickets by access" ON public.tickets
FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND (SELECT is_active_employee())
  AND (
    (SELECT is_admin())
    OR (
      (SELECT has_section_permission('support'))
      AND (cardinality((SELECT access_ticket_types())) = 0 OR type = ANY((SELECT access_ticket_types())))
    )
  )
);

DROP POLICY IF EXISTS "Read media by access" ON public.media_records;
CREATE POLICY "Read media by access" ON public.media_records
FOR SELECT TO authenticated
USING (deleted_at IS NULL AND (SELECT is_active_employee()) AND ((SELECT is_admin()) OR (SELECT has_section_permission('media'))));

DROP POLICY IF EXISTS "Active employees read settings" ON public.app_settings;
CREATE POLICY "Active employees read settings" ON public.app_settings
FOR SELECT TO authenticated
USING ((SELECT is_active_employee()));

DROP POLICY IF EXISTS "Authenticated insert suppliers" ON public.suppliers;
CREATE POLICY "Authenticated insert suppliers" ON public.suppliers
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT is_active_employee())
  AND ((SELECT is_admin()) OR (SELECT has_section_permission('suppliers')))
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "Authenticated insert buyers" ON public.buyers;
CREATE POLICY "Authenticated insert buyers" ON public.buyers
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT is_active_employee())
  AND ((SELECT is_admin()) OR (SELECT has_section_permission('buyers')))
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "Authenticated insert tasks" ON public.tasks;
CREATE POLICY "Authenticated insert tasks" ON public.tasks
FOR INSERT TO authenticated
WITH CHECK ((SELECT is_active_employee()) AND ((SELECT is_admin()) OR (SELECT has_section_permission('tasks'))));

DROP POLICY IF EXISTS "Authenticated insert tickets" ON public.tickets;
CREATE POLICY "Authenticated insert tickets" ON public.tickets
FOR INSERT TO authenticated
WITH CHECK ((SELECT is_active_employee()) AND ((SELECT is_admin()) OR (SELECT has_section_permission('support'))));

DROP POLICY IF EXISTS "Authenticated insert media" ON public.media_records;
CREATE POLICY "Authenticated insert media" ON public.media_records
FOR INSERT TO authenticated
WITH CHECK ((SELECT is_active_employee()) AND ((SELECT is_admin()) OR (SELECT has_section_permission('media'))));

DROP POLICY IF EXISTS "Authorized update suppliers" ON public.suppliers;
CREATE POLICY "Authorized update suppliers" ON public.suppliers
FOR UPDATE TO authenticated
USING (deleted_at IS NULL AND (SELECT is_active_employee()) AND ((SELECT is_admin()) OR ((SELECT has_section_permission('suppliers')) AND (cardinality((SELECT access_supplier_types())) = 0 OR type = ANY((SELECT access_supplier_types()))) AND (cardinality((SELECT access_supplier_cities())) = 0 OR city = ANY((SELECT access_supplier_cities()))))))
WITH CHECK (deleted_at IS NULL AND (SELECT is_active_employee()) AND ((SELECT is_admin()) OR ((SELECT has_section_permission('suppliers')) AND (cardinality((SELECT access_supplier_types())) = 0 OR type = ANY((SELECT access_supplier_types()))) AND (cardinality((SELECT access_supplier_cities())) = 0 OR city = ANY((SELECT access_supplier_cities()))))));

DROP POLICY IF EXISTS "Authorized update buyers" ON public.buyers;
CREATE POLICY "Authorized update buyers" ON public.buyers
FOR UPDATE TO authenticated
USING (deleted_at IS NULL AND (SELECT is_active_employee()) AND ((SELECT is_admin()) OR ((SELECT has_section_permission('buyers')) AND (cardinality((SELECT access_buyer_types())) = 0 OR type = ANY((SELECT access_buyer_types()))) AND (cardinality((SELECT access_buyer_cities())) = 0 OR city = ANY((SELECT access_buyer_cities()))))))
WITH CHECK (deleted_at IS NULL AND (SELECT is_active_employee()) AND ((SELECT is_admin()) OR ((SELECT has_section_permission('buyers')) AND (cardinality((SELECT access_buyer_types())) = 0 OR type = ANY((SELECT access_buyer_types()))) AND (cardinality((SELECT access_buyer_cities())) = 0 OR city = ANY((SELECT access_buyer_cities()))))));

DROP POLICY IF EXISTS "Authorized update tasks" ON public.tasks;
CREATE POLICY "Authorized update tasks" ON public.tasks
FOR UPDATE TO authenticated
USING (deleted_at IS NULL AND (SELECT is_active_employee()) AND ((SELECT is_admin()) OR ((SELECT has_section_permission('tasks')))))
WITH CHECK (deleted_at IS NULL AND (SELECT is_active_employee()) AND ((SELECT is_admin()) OR ((SELECT has_section_permission('tasks')))));

DROP POLICY IF EXISTS "Authorized update tickets" ON public.tickets;
CREATE POLICY "Authorized update tickets" ON public.tickets
FOR UPDATE TO authenticated
USING (deleted_at IS NULL AND (SELECT is_active_employee()) AND ((SELECT is_admin()) OR ((SELECT has_section_permission('support')) AND (cardinality((SELECT access_ticket_types())) = 0 OR type = ANY((SELECT access_ticket_types()))))))
WITH CHECK (deleted_at IS NULL AND (SELECT is_active_employee()) AND ((SELECT is_admin()) OR ((SELECT has_section_permission('support')) AND (cardinality((SELECT access_ticket_types())) = 0 OR type = ANY((SELECT access_ticket_types()))))));

DROP POLICY IF EXISTS "Authorized update media_records" ON public.media_records;
CREATE POLICY "Authorized update media_records" ON public.media_records
FOR UPDATE TO authenticated
USING (deleted_at IS NULL AND (SELECT is_active_employee()) AND ((SELECT is_admin()) OR ((SELECT has_section_permission('media')))))
WITH CHECK (deleted_at IS NULL AND (SELECT is_active_employee()) AND ((SELECT is_admin()) OR ((SELECT has_section_permission('media')))));

DROP POLICY IF EXISTS "Admin update settings" ON public.app_settings;
CREATE POLICY "Admin update settings" ON public.app_settings
FOR UPDATE TO authenticated
USING ((SELECT is_active_employee()) AND (SELECT is_admin()) AND id = 'global')
WITH CHECK ((SELECT is_active_employee()) AND (SELECT is_admin()) AND id = 'global');

DROP POLICY IF EXISTS "Admin insert settings" ON public.app_settings;
CREATE POLICY "Admin insert settings" ON public.app_settings
FOR INSERT TO authenticated
WITH CHECK ((SELECT is_active_employee()) AND (SELECT is_admin()) AND id = 'global');

DROP POLICY IF EXISTS "Admin delete suppliers" ON public.suppliers;
CREATE POLICY "Admin delete suppliers" ON public.suppliers
FOR DELETE TO authenticated
USING ((SELECT is_active_employee()) AND (SELECT is_admin()));

DROP POLICY IF EXISTS "Admin delete buyers" ON public.buyers;
CREATE POLICY "Admin delete buyers" ON public.buyers
FOR DELETE TO authenticated
USING ((SELECT is_active_employee()) AND (SELECT is_admin()));

DROP POLICY IF EXISTS "Admin delete tasks" ON public.tasks;
CREATE POLICY "Admin delete tasks" ON public.tasks
FOR DELETE TO authenticated
USING ((SELECT is_active_employee()) AND (SELECT is_admin()));

DROP POLICY IF EXISTS "Admin delete tickets" ON public.tickets;
CREATE POLICY "Admin delete tickets" ON public.tickets
FOR DELETE TO authenticated
USING ((SELECT is_active_employee()) AND (SELECT is_admin()));

DROP POLICY IF EXISTS "Admin delete media" ON public.media_records;
CREATE POLICY "Admin delete media" ON public.media_records
FOR DELETE TO authenticated
USING ((SELECT is_active_employee()) AND (SELECT is_admin()));

DROP POLICY IF EXISTS "Authenticated insert app_logs" ON public.app_logs;
CREATE POLICY "Authenticated insert app_logs" ON public.app_logs
FOR INSERT TO authenticated
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin read app_logs" ON public.app_logs;
CREATE POLICY "Admin read app_logs" ON public.app_logs
FOR SELECT TO authenticated
USING ((SELECT is_admin()));

DROP POLICY IF EXISTS "Public read lk-assets" ON storage.objects;
CREATE POLICY "Public read lk-assets" ON storage.objects
FOR SELECT TO anon, authenticated
USING (bucket_id = 'lk-assets');

DROP POLICY IF EXISTS "Auth upload lk-assets" ON storage.objects;
CREATE POLICY "Auth upload lk-assets" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'lk-assets');

DROP POLICY IF EXISTS "Auth update lk-assets" ON storage.objects;
CREATE POLICY "Auth update lk-assets" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'lk-assets')
WITH CHECK (bucket_id = 'lk-assets');

DROP POLICY IF EXISTS "Auth delete lk-assets" ON storage.objects;
CREATE POLICY "Auth delete lk-assets" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'lk-assets');

DROP POLICY IF EXISTS "Active employees read knowledge files" ON storage.objects;
CREATE POLICY "Active employees read knowledge files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'knowledge' AND (SELECT is_active_employee()));

DROP POLICY IF EXISTS "Authenticated upload to knowledge" ON storage.objects;
CREATE POLICY "Authenticated upload to knowledge" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'knowledge' AND (SELECT is_active_employee()));

DROP POLICY IF EXISTS "Active employees update knowledge files" ON storage.objects;
CREATE POLICY "Active employees update knowledge files" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'knowledge' AND (SELECT is_active_employee()))
WITH CHECK (bucket_id = 'knowledge' AND (SELECT is_active_employee()));

DROP POLICY IF EXISTS "Admin delete knowledge files" ON storage.objects;
CREATE POLICY "Admin delete knowledge files" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'knowledge' AND (SELECT is_active_employee()) AND (SELECT is_admin()));

-- Тесты: supabase test db (supabase/tests/database/rls_test.sql)
