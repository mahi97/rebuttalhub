-- Migration v6: Threaded comments and saved merged rebuttal history

ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS comments_review_point_thread_idx
  ON comments (review_point_id, parent_comment_id, created_at);

CREATE TABLE IF NOT EXISTS rebuttal_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  review_id UUID REFERENCES reviews(id) ON DELETE CASCADE,
  reviewer_name TEXT,
  scope TEXT NOT NULL CHECK (scope IN ('reviewer', 'all')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rebuttal_version_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID REFERENCES rebuttal_versions(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  applied_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  change_set JSONB NOT NULL DEFAULT '[]'::jsonb,
  reverted_at TIMESTAMPTZ,
  reverted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rebuttal_versions_project_created_idx
  ON rebuttal_versions (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rebuttal_versions_review_created_idx
  ON rebuttal_versions (review_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rebuttal_version_applications_project_created_idx
  ON rebuttal_version_applications (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rebuttal_version_applications_version_created_idx
  ON rebuttal_version_applications (version_id, created_at DESC);

ALTER TABLE rebuttal_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rebuttal_version_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view rebuttal versions" ON rebuttal_versions;
CREATE POLICY "Members can view rebuttal versions" ON rebuttal_versions FOR SELECT
  USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Members can create rebuttal versions" ON rebuttal_versions;
CREATE POLICY "Members can create rebuttal versions" ON rebuttal_versions FOR INSERT
  WITH CHECK (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Members can update rebuttal versions" ON rebuttal_versions;
CREATE POLICY "Members can update rebuttal versions" ON rebuttal_versions FOR UPDATE
  USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Members can view rebuttal version applications" ON rebuttal_version_applications;
CREATE POLICY "Members can view rebuttal version applications" ON rebuttal_version_applications FOR SELECT
  USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Members can create rebuttal version applications" ON rebuttal_version_applications;
CREATE POLICY "Members can create rebuttal version applications" ON rebuttal_version_applications FOR INSERT
  WITH CHECK (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Members can update rebuttal version applications" ON rebuttal_version_applications;
CREATE POLICY "Members can update rebuttal version applications" ON rebuttal_version_applications FOR UPDATE
  USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
