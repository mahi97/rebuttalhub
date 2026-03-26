-- Migration v7: Allow project owners to delete projects and project files

DROP POLICY IF EXISTS "Owners can delete projects" ON projects;
CREATE POLICY "Owners can delete projects" ON projects FOR DELETE
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Project owners can delete project files" ON storage.objects;
CREATE POLICY "Project owners can delete project files" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-files' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM projects WHERE owner_id = auth.uid()
    )
  );
