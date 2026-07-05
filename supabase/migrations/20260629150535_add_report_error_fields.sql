/*
# Add error_message column to reports table

1. Modified Tables
- `reports`
  - Added `error_message` (text, nullable) — stores error details if report generation fails
  - Added `generation_status` (text, default 'pending') — pending | processing | done | failed

2. Notes
- This allows tracking report generation status and errors
- Frontend can display specific error messages instead of waiting indefinitely
*/

ALTER TABLE reports ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS generation_status text NOT NULL DEFAULT 'pending' CHECK (generation_status IN ('pending', 'processing', 'done', 'failed'));