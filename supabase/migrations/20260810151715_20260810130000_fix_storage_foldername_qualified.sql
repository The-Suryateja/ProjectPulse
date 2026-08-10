/*
# Fix storage policies: fully-qualify the column passed to storage.foldername()

## Problem
The previous fix (20260810120000) used the unqualified column `name` inside an
EXISTS subquery against `projects`.  Postgres resolved `name` to
`projects.name` (the project display name) instead of `storage.objects.name`
(the object key), so storage.foldername() still received the wrong value and
every upload was still rejected.

## Fix
Fully qualify the column as `storage.objects.name` so there is no ambiguity.
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
      WHERE projects.id::text = (storage.foldername(storage.objects.name))[1]
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "owner_insert_documents_storage" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'documents' AND
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id::text = (storage.foldername(storage.objects.name))[1]
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "owner_update_documents_storage" ON storage.objects FOR UPDATE
  TO authenticated USING (
    bucket_id = 'documents' AND
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id::text = (storage.foldername(storage.objects.name))[1]
        AND projects.user_id = auth.uid()
    )
  ) WITH CHECK (
    bucket_id = 'documents' AND
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id::text = (storage.foldername(storage.objects.name))[1]
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "owner_delete_documents_storage" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'documents' AND
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id::text = (storage.foldername(storage.objects.name))[1]
        AND projects.user_id = auth.uid()
    )
  );
