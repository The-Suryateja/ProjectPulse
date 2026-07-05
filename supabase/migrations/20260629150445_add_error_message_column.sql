/*
# Add error_message column to documents table

1. Modified Tables
- `documents`
  - Added `error_message` (text, nullable) — stores error details when extraction_status is 'failed'

2. Notes
- This allows storing specific error messages from Anthropic API failures, timeouts, or other issues
- Frontend can display these errors instead of showing a generic "Processing" spinner
*/

ALTER TABLE documents ADD COLUMN IF NOT EXISTS error_message text;