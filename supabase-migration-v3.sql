-- Migration v3: Comments system + fix PDF processing

-- Comments on review points
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_point_id UUID REFERENCES review_points(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view comments" ON comments FOR SELECT
  USING (project_id IN (SELECT get_my_project_ids()));
CREATE POLICY "Members can create comments" ON comments FOR INSERT
  WITH CHECK (project_id IN (SELECT get_my_project_ids()));
CREATE POLICY "Members can update comments" ON comments FOR UPDATE
  USING (project_id IN (SELECT get_my_project_ids()));

-- Add to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
