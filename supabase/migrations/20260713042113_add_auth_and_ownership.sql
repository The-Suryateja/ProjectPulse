/*
# Add authentication and ownership-based access control

## Problem
The original schema (20260627133740_projectpulse_schema.sql) enabled RLS but
then granted `anon` + `authenticated` full SELECT/INSERT/UPDATE/DELETE on every
table and on the storage bucket, with no ownership check at all. In practice
this meant anyone with the public anon key (which ships in every client
bundle) could read, edit, or delete any project, document, or report
belonging to any user.

## Fix
1. Add a `user_id` column to `projects`, defaulting to the requesting user
   (`auth.uid()`), so every project has an owner.
2. Drop all `anon_*` policies on projects/documents/reports.
3. Add `owner_*` policies scoped to `auth.uid()`:
   - `projects`: user must own the row directly (user_id = auth.uid())
   - `documents` / `reports`: user must own the parent project
   - `anon` role is no longer granted any access — login is now required
4. Rework the `documents` storage bucket policies the same way, using the
   first path segment of the object key (`${project_id}/${file_name}`) to
   resolve the owning project.

## Notes / migration caveats
- Existing rows created before this migration have `user_id = NULL` and will
  become invisible to everyone (including their original creator) until
  manually reassigned, since this project previously had no auth and no way
  to know who "owns" old demo data. If you need to keep old rows, update
  their `user_id` by hand after this migration runs, e.g.:
    UPDATE projects SET user_id = '<your-auth-uid>' WHERE user_id IS NULL;
- This migration does not create any Supabase Auth users. The frontend now
  requires a signed-in session (see src/lib/AuthContext.tsx / src/pages/Login.tsx).
*/

-- 1. Ownership column on projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE projects
  ALTER COLUMN user_id SET DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects (user_id);

-- 2. Projects policies: drop old public ones, add owner-scoped ones
DROP POLICY IF EXISTS "anon_select_projects" ON projects;
DROP POLICY IF EXISTS "anon_insert_projects" ON projects;
DROP POLICY IF EXISTS "anon_update_projects" ON projects;
DROP POLICY IF EXISTS "anon_delete_projects" ON projects;

DROP POLICY IF EXISTS "owner_select_projects" ON projects;
CREATE POLICY "owner_select_projects" ON projects FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "owner_insert_projects" ON projects;
CREATE POLICY "owner_insert_projects" ON projects FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "owner_update_projects" ON projects;
CREATE POLICY "owner_update_projects" ON projects FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "owner_delete_projects" ON projects;
CREATE POLICY "owner_delete_projects" ON projects FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- 3. Documents policies: ownership via parent project
DROP POLICY IF EXISTS "anon_select_documents" ON documents;
DROP POLICY IF EXISTS "anon_insert_documents" ON documents;
DROP POLICY IF EXISTS "anon_update_documents" ON documents;
DROP POLICY IF EXISTS "anon_delete_documents" ON documents;

DROP POLICY IF EXISTS "owner_select_documents" ON documents;
CREATE POLICY "owner_select_documents" ON documents FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = documents.project_id AND projects.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "owner_insert_documents" ON documents;
CREATE POLICY "owner_insert_documents" ON documents FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = documents.project_id AND projects.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "owner_update_documents" ON documents;
CREATE POLICY "owner_update_documents" ON documents FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = documents.project_id AND projects.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = documents.project_id AND projects.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "owner_delete_documents" ON documents;
CREATE POLICY "owner_delete_documents" ON documents FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = documents.project_id AND projects.user_id = auth.uid()
    )
  );

-- 4. Reports policies: ownership via parent project
DROP POLICY IF EXISTS "anon_select_reports" ON reports;
DROP POLICY IF EXISTS "anon_insert_reports" ON reports;
DROP POLICY IF EXISTS "anon_update_reports" ON reports;
DROP POLICY IF EXISTS "anon_delete_reports" ON reports;

DROP POLICY IF EXISTS "owner_select_reports" ON reports;
CREATE POLICY "owner_select_reports" ON reports FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = reports.project_id AND projects.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "owner_insert_reports" ON reports;
CREATE POLICY "owner_insert_reports" ON reports FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = reports.project_id AND projects.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "owner_update_reports" ON reports;
CREATE POLICY "owner_update_reports" ON reports FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = reports.project_id AND projects.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = reports.project_id AND projects.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "owner_delete_reports" ON reports;
CREATE POLICY "owner_delete_reports" ON reports FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = reports.project_id AND projects.user_id = auth.uid()
    )
  );

-- 5. Storage policies: ownership via first path segment (project_id) of the object key
-- Objects are stored as `${project_id}/${file_name}`, so (storage.foldername(name))[1]
-- gives us the project_id to check ownership against.
DROP POLICY IF EXISTS "anon_select_documents_storage" ON storage.objects;
DROP POLICY IF EXISTS "anon_insert_documents_storage" ON storage.objects;
DROP POLICY IF EXISTS "anon_update_documents_storage" ON storage.objects;
DROP POLICY IF EXISTS "anon_delete_documents_storage" ON storage.objects;

DROP POLICY IF EXISTS "owner_select_documents_storage" ON storage.objects;
CREATE POLICY "owner_select_documents_storage" ON storage.objects FOR SELECT
  TO authenticated USING (
    bucket_id = 'documents' AND
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id::text = (storage.foldername(name))[1]
        AND projects.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "owner_insert_documents_storage" ON storage.objects;
CREATE POLICY "owner_insert_documents_storage" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'documents' AND
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id::text = (storage.foldername(name))[1]
        AND projects.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "owner_update_documents_storage" ON storage.objects;
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

DROP POLICY IF EXISTS "owner_delete_documents_storage" ON storage.objects;
CREATE POLICY "owner_delete_documents_storage" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'documents' AND
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id::text = (storage.foldername(name))[1]
        AND projects.user_id = auth.uid()
    )
  );
