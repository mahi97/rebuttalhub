-- RebuttalHub Database Schema
-- Run this in Supabase SQL Editor

-- Users profile (auto-populated on first login)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  anthropic_api_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Projects (each project = one paper rebuttal)
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  invite_code TEXT UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  rebuttal_template TEXT,
  guidelines TEXT,
  archived_at TIMESTAMPTZ,
  archived_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  archived_reason TEXT,
  archived_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Project members (many-to-many)
CREATE TABLE IF NOT EXISTS project_members (
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

-- Files attached to a project
CREATE TABLE IF NOT EXISTS project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT,
  uploaded_by UUID REFERENCES profiles(id),
  extracted_text TEXT,
  extracted_markdown TEXT,
  html_content TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Reviews extracted from OpenReview HTML
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  reviewer_name TEXT,
  rating TEXT,
  confidence TEXT,
  raw_text TEXT,
  summary TEXT,
  thank_you_note TEXT,
  sections JSONB DEFAULT '{}',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Individual review points (each becomes a task)
CREATE TABLE IF NOT EXISTS review_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID REFERENCES reviews(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  section TEXT,
  label TEXT DEFAULT '',
  point_text TEXT NOT NULL,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  status TEXT DEFAULT 'not_started' CHECK (status IN (
    'not_started', 'in_progress', 'need_experiments',
    'need_more_work', 'prof_review', 'polishing', 'done'
  )),
  assigned_to UUID REFERENCES profiles(id),
  draft_response TEXT,
  final_response TEXT,
  notes TEXT,
  sort_order INT DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  archived_reason TEXT,
  archived_metadata JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_point_id UUID REFERENCES review_points(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

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

CREATE INDEX IF NOT EXISTS projects_active_updated_idx
  ON projects (archived_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS review_points_active_idx
  ON review_points (project_id, deleted_at, sort_order);

CREATE INDEX IF NOT EXISTS comments_review_point_thread_idx
  ON comments (review_point_id, parent_comment_id, created_at);

CREATE INDEX IF NOT EXISTS rebuttal_versions_project_created_idx
  ON rebuttal_versions (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rebuttal_versions_review_created_idx
  ON rebuttal_versions (review_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rebuttal_version_applications_project_created_idx
  ON rebuttal_version_applications (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rebuttal_version_applications_version_created_idx
  ON rebuttal_version_applications (version_id, created_at DESC);

-- Activity log
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  action TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rebuttal_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rebuttal_version_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Profiles: users can view and update their own profile
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Projects: members can view, owners can update, auth users can create
CREATE POLICY "Members can view projects" ON projects FOR SELECT
  USING (id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "Owners can update projects" ON projects FOR UPDATE
  USING (owner_id = auth.uid());
CREATE POLICY "Owners can delete projects" ON projects FOR DELETE
  USING (owner_id = auth.uid());
CREATE POLICY "Auth users can create projects" ON projects FOR INSERT
  WITH CHECK (auth.uid() = owner_id);
-- Allow finding projects by invite code for joining
CREATE POLICY "Anyone can find project by invite code" ON projects FOR SELECT
  USING (true);

-- Project members
CREATE POLICY "Members can view project members" ON project_members FOR SELECT
  USING (project_id IN (SELECT project_id FROM project_members pm WHERE pm.user_id = auth.uid()));
CREATE POLICY "Auth users can join projects" ON project_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners can manage members" ON project_members FOR DELETE
  USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- Project files
CREATE POLICY "Members can view project files" ON project_files FOR SELECT
  USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can upload files" ON project_files FOR INSERT
  WITH CHECK (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can update files" ON project_files FOR UPDATE
  USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));

-- Reviews
CREATE POLICY "Members can view reviews" ON reviews FOR SELECT
  USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can create reviews" ON reviews FOR INSERT
  WITH CHECK (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can update reviews" ON reviews FOR UPDATE
  USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));

-- Review points
CREATE POLICY "Members can view review points" ON review_points FOR SELECT
  USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can create review points" ON review_points FOR INSERT
  WITH CHECK (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can update review points" ON review_points FOR UPDATE
  USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can delete review points" ON review_points FOR DELETE
  USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));

-- Comments
CREATE POLICY "Members can view comments" ON comments FOR SELECT
  USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can create comments" ON comments FOR INSERT
  WITH CHECK (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can update comments" ON comments FOR UPDATE
  USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));

-- Rebuttal version history
CREATE POLICY "Members can view rebuttal versions" ON rebuttal_versions FOR SELECT
  USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can create rebuttal versions" ON rebuttal_versions FOR INSERT
  WITH CHECK (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can update rebuttal versions" ON rebuttal_versions FOR UPDATE
  USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));

CREATE POLICY "Members can view rebuttal version applications" ON rebuttal_version_applications FOR SELECT
  USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can create rebuttal version applications" ON rebuttal_version_applications FOR INSERT
  WITH CHECK (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can update rebuttal version applications" ON rebuttal_version_applications FOR UPDATE
  USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));

-- Activity log
CREATE POLICY "Members can view activity" ON activity_log FOR SELECT
  USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can log activity" ON activity_log FOR INSERT
  WITH CHECK (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('project-files', 'project-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Members can upload to project files" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-files' AND
    (storage.foldername(name))[1] IN (
      SELECT project_id::text FROM project_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Members can view project files" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-files' AND
    (storage.foldername(name))[1] IN (
      SELECT project_id::text FROM project_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Project owners can delete project files" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-files' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM projects WHERE owner_id = auth.uid()
    )
  );

-- Enable realtime for collaborative features
ALTER PUBLICATION supabase_realtime ADD TABLE review_points;
ALTER PUBLICATION supabase_realtime ADD TABLE reviews;
ALTER PUBLICATION supabase_realtime ADD TABLE project_files;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
