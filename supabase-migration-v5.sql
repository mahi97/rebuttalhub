-- Migration v5: Soft-delete task archive and restore support

ALTER TABLE review_points
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS review_points_active_idx
  ON review_points (project_id, deleted_at, sort_order);
