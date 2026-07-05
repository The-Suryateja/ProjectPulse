/*
# ProjectPulse Database Schema

1. New Tables
- `projects` — groups multiple documents for a single analysis
  - `id` (uuid, primary key)
  - `name` (text, not null) — user-provided project name
  - `created_at` (timestamp)
  
- `documents` — individual uploaded PDF files
  - `id` (uuid, primary key)
  - `project_id` (uuid, references projects, cascade delete)
  - `file_name` (text, not null)
  - `storage_path` (text, not null) — path in Supabase Storage
  - `document_type` (text, not null) — meeting_notes | spec | email | other
  - `document_date` (date, not null) — USER-PROVIDED, never LLM-guessed
  - `extraction_status` (text, default 'pending') — pending | processing | done | failed
  - `extracted_data` (jsonb) — stores extraction schema output
  - `created_at` (timestamp)
  
- `reports` — aggregated project report
  - `id` (uuid, primary key)
  - `project_id` (uuid, references projects, cascade delete)
  - `aggregated_data` (jsonb) — stores aggregation schema output
  - `generated_at` (timestamp)

2. Security
- Enable RLS on all three tables
- Single-tenant app (no auth): allow anon + authenticated full CRUD
- Data is intentionally shared/public for demo purposes

3. Notes
- extraction_status enum: pending, processing, done, failed
- document_type enum: meeting_notes, spec, email, other
- document_date is ALWAYS user-provided at upload time
- extracted_data follows the EXTRACTION SCHEMA
- aggregated_data follows the AGGREGATION SCHEMA
*/

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('meeting_notes', 'spec', 'email', 'other')),
  document_date date NOT NULL,
  extraction_status text NOT NULL DEFAULT 'pending' CHECK (extraction_status IN ('pending', 'processing', 'done', 'failed')),
  extracted_data jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  aggregated_data jsonb,
  generated_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Projects policies (single-tenant, no auth)
DROP POLICY IF EXISTS "anon_select_projects" ON projects;
CREATE POLICY "anon_select_projects" ON projects FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_projects" ON projects;
CREATE POLICY "anon_insert_projects" ON projects FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_projects" ON projects;
CREATE POLICY "anon_update_projects" ON projects FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_projects" ON projects;
CREATE POLICY "anon_delete_projects" ON projects FOR DELETE
  TO anon, authenticated USING (true);

-- Documents policies (single-tenant, no auth)
DROP POLICY IF EXISTS "anon_select_documents" ON documents;
CREATE POLICY "anon_select_documents" ON documents FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_documents" ON documents;
CREATE POLICY "anon_insert_documents" ON documents FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_documents" ON documents;
CREATE POLICY "anon_update_documents" ON documents FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_documents" ON documents;
CREATE POLICY "anon_delete_documents" ON documents FOR DELETE
  TO anon, authenticated USING (true);

-- Reports policies (single-tenant, no auth)
DROP POLICY IF EXISTS "anon_select_reports" ON reports;
CREATE POLICY "anon_select_reports" ON reports FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_reports" ON reports;
CREATE POLICY "anon_insert_reports" ON reports FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_reports" ON reports;
CREATE POLICY "anon_update_reports" ON reports FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_reports" ON reports;
CREATE POLICY "anon_delete_reports" ON reports FOR DELETE
  TO anon, authenticated USING (true);

-- Create storage bucket for PDF uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for the documents bucket
DROP POLICY IF EXISTS "anon_select_documents_storage" ON storage.objects;
CREATE POLICY "anon_select_documents_storage" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "anon_insert_documents_storage" ON storage.objects;
CREATE POLICY "anon_insert_documents_storage" ON storage.objects FOR INSERT
  TO anon, authenticated WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS "anon_update_documents_storage" ON storage.objects;
CREATE POLICY "anon_update_documents_storage" ON storage.objects FOR UPDATE
  TO anon, authenticated USING (bucket_id = 'documents') WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS "anon_delete_documents_storage" ON storage.objects;
CREATE POLICY "anon_delete_documents_storage" ON storage.objects FOR DELETE
  TO anon, authenticated USING (bucket_id = 'documents');