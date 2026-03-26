'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Project, ProjectMember, ProjectFile, Profile } from '@/types';

export function useProject(projectId: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<(ProjectMember & { profile: Profile })[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  const fetchProject = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();
    setProject(data);
  }, [projectId]);

  const fetchMembers = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('project_members')
      .select('*, profile:profiles(*)')
      .eq('project_id', projectId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setMembers((data as any) || []);
  }, [projectId]);

  const fetchFiles = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    setFiles(data || []);
  }, [projectId]);

  useEffect(() => {
    fetchedRef.current = false;
  }, [projectId]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    Promise.all([fetchProject(), fetchMembers(), fetchFiles()]).finally(() =>
      setLoading(false)
    );
  }, [fetchProject, fetchMembers, fetchFiles]);

  return { project, members, files, loading, refetchProject: fetchProject, refetchMembers: fetchMembers, refetchFiles: fetchFiles };
}
