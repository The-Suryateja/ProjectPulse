/*
# Fix storage policies: wrong column passed to storage.foldername()

## Problem
The deployed storage policies on storage.objects call
  storage.foldername(projects.name)
instead of
  storage.foldername(name)
where `name` is the storage.objects.name column (the object key, e.g.
`${project_id}/${file_name}`).  Passing projects.name (the project display
name like "project Z") makes storage.foldername() return an empty array,
so (storage.foldername(...))[1] is NULL, the EXISTS clause is always false,
and every upload is rejected by RLS with "new row-level security policy
violated".

## Fix
Drop and recreate all four storage policies with the correct reference:
storage.foldername(name) — the storage object's own key column.
The ownership check (projects.user_id = auth.uid()) is unchanged; only
the column fed to storage.foldername() is corrected.
*/

DROP POLICY IF EXISTS "owner_select_documents_storage" ON storage.objects;
DROP POLICY IF EXISTS "owner_insert_documents_storage" ON storage.objects;
DROP POLICY IF EXISTS "owner_update_documents_storage" ON storage.objects;
DROP POLICY IF EXISTS "owner_delete_documents_storage" ON storage.objects;

CREATE POLICY "owner_select_documents_storage" ON storage.objects FOR SELECT
  TO authenticated USING (
    bucket_id = 'documents' AND
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id::text = (storage.foldername(name))[1]
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "owner_insert_documents_storage" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'documents' AND
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id::text = (storage.foldername(name))[1]
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "owner_update_documents_storage" ON storage.objects FOR UPDATE
  TO authenticated USING (
    bucket_id = 'documents' AND
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id::text = (storage.foldername(name))[1]
        AND projects.user_id = auth.uid()
    )
  ) WITH CHECK (
    bucket_id = 'documents' AND
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id::text = (storage.foldername(name))[1]
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "owner_delete_documents_storage" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'documents' AND
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id::text = (storage.foldername(name))[1]
        AND projects.user_id = auth.uid()
    )
  );
