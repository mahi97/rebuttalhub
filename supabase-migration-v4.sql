-- Migration v4: Allow members to delete review points

CREATE POLICY "Members can delete review points" ON review_points FOR DELETE
  USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
