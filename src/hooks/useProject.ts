'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Project, ProjectMember, ProjectFile, Profile } from '@/types';

interface UseProjectOptions {
  includeProject?: boolean;
  includeMembers?: boolean;
  includeFiles?: boolean;
  fileSelect?: string;
}

export function useProject(
  projectId: string,
  {
    includeProject = true,
    includeMembers = true,
    includeFiles = true,
    fileSelect = '*',
  }: UseProjectOptions = {}
) {
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<(ProjectMember & { profile: Profile })[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  const fetchProject = useCallback(async () => {
    if (!includeProject) {
      setProject(null);
      return;
    }

    const supabase = createClient();
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();
    setProject(data);
  }, [includeProject, projectId]);

  const fetchMembers = useCallback(async () => {
    if (!includeMembers) {
      setMembers([]);
      return;
    }

    const supabase = createClient();
    const { data } = await supabase
      .from('project_members')
      .select('*, profile:profiles(*)')
      .eq('project_id', projectId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setMembers((data as any) || []);
  }, [includeMembers, projectId]);

  const fetchFiles = useCallback(async () => {
    if (!includeFiles) {
      setFiles([]);
      return;
    }

    const supabase = createClient();
    const { data } = await supabase
      .from('project_files')
      .select(fileSelect)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    setFiles(data || []);
  }, [fileSelect, includeFiles, projectId]);

  useEffect(() => {
    fetchedRef.current = false;
  }, [fileSelect, includeFiles, includeMembers, includeProject, projectId]);

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
