'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import ProjectCard from '@/components/project/ProjectCard';
import UserMenu from '@/components/auth/UserMenu';
import {
  Plus,
  UserPlus,
  FileText,
  Loader2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import type { Project, Profile } from '@/types';
import { calculateWeightedTaskProgress } from '@/lib/utils';

export default function DashboardPage() {
  const [projects, setProjects] = useState<(Project & { memberCount?: number; reviewCount?: number; pointsTotal?: number; pointsProgress?: number })[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showJoinProject, setShowJoinProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    setProfile(profileData);

    // Get projects the user is a member of
    const { data: memberships } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', user.id);

    if (!memberships?.length) {
      setProjects([]);
      setLoading(false);
      return;
    }

    const projectIds = memberships.map((m) => m.project_id);
    const { data: projectsData } = await supabase
      .from('projects')
      .select('*')
      .in('id', projectIds)
      .order('updated_at', { ascending: false });

    // Enrich with counts
    const enriched = await Promise.all(
      (projectsData || []).map(async (p) => {
        const [{ count: memberCount }, { count: reviewCount }, { data: pointsData }] = await Promise.all([
          supabase.from('project_members').select('*', { count: 'exact', head: true }).eq('project_id', p.id),
          supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('project_id', p.id),
          supabase.from('review_points').select('status').eq('project_id', p.id).is('deleted_at', null),
        ]);

        return {
          ...p,
          memberCount: memberCount || 0,
          reviewCount: reviewCount || 0,
          pointsTotal: pointsData?.length || 0,
          pointsProgress: calculateWeightedTaskProgress(pointsData || []),
        };
      })
    );

    setProjects(enriched);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName, description: newProjectDesc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success('Project created');
      router.push(`/project/${data.project.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinProject = async () => {
    if (!joinCode.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/projects/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: joinCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Joined ${data.project.name}`);
      router.push(`/project/${data.project.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to join project');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--card)]/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-400" />
            <h1 className="text-xl font-bold">RebuttalHub</h1>
          </div>
          {profile && <UserMenu user={profile} />}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Actions */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Projects</h2>
          <div className="flex gap-3">
            <button
              onClick={() => { setShowJoinProject(true); setShowNewProject(false); }}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm hover:border-blue-500/50 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Join Project
            </button>
            <button
              onClick={() => { setShowNewProject(true); setShowJoinProject(false); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>
          </div>
        </div>

        {/* New Project Form */}
        {showNewProject && (
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Create New Project</h3>
              <button onClick={() => setShowNewProject(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name (e.g., ICML 2025 - Paper #1234)"
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
              <textarea
                value={newProjectDesc}
                onChange={(e) => setNewProjectDesc(e.target.value)}
                placeholder="Description (optional)"
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm resize-none h-20 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleCreateProject}
                disabled={creating || !newProjectName.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Project
              </button>
            </div>
          </div>
        )}

        {/* Join Project Form */}
        {showJoinProject && (
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Join Project</h3>
              <button onClick={() => setShowJoinProject(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="flex gap-3">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Enter invite code"
                className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
              <button
                onClick={handleJoinProject}
                disabled={creating || !joinCode.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Join
              </button>
            </div>
          </div>
        )}

        {/* Project Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-48" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-[var(--card)] flex items-center justify-center mx-auto mb-4">
              <FileText className="w-10 h-10 text-[var(--muted-foreground)]" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
            <p className="text-[var(--muted-foreground)] mb-4">
              Create a new project to start managing your paper rebuttals.
            </p>
            <button
              onClick={() => setShowNewProject(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Your First Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
