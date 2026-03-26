'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Project, ProjectMember, ProjectFile, Profile } from '@/types';

export function useProject(projectId: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<(ProjectMember & { profile: Profile })[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const fetchProject = useCallback(async () => {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();
    setProject(data);
  }, [projectId, supabase]);

  const fetchMembers = useCallback(async () => {
    const { data } = await supabase
      .from('project_members')
      .select('*, profile:profiles(*)')
      .eq('project_id', projectId);
    setMembers((data as any) || []);
  }, [projectId, supabase]);

  const fetchFiles = useCallback(async () => {
    const { data } = await supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    setFiles(data || []);
  }, [projectId, supabase]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchProject(), fetchMembers(), fetchFiles()]).finally(() =>
      setLoading(false)
    );
  }, [fetchProject, fetchMembers, fetchFiles]);

  return { project, members, files, loading, refetchProject: fetchProject, refetchMembers: fetchMembers, refetchFiles: fetchFiles };
}
