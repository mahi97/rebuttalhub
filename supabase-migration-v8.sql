-- Migration v8: Project archive and restore support

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS projects_active_updated_idx
  ON projects (archived_at, updated_at DESC);
