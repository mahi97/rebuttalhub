'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useProject } from '@/hooks/useProject';
import InviteModal from '@/components/project/InviteModal';
import { createClient } from '@/lib/supabase/client';
import { Settings, Users, UserPlus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ProjectSettingsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { project, members, loading, refetchProject } = useProject(projectId);
  const [showInvite, setShowInvite] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const supabase = createClient();

  // Initialize form values when project loads
  if (project && !name) {
    setName(project.name);
    setDescription(project.description || '');
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({ name, description, updated_at: new Date().toISOString() })
        .eq('id', projectId);

      if (error) throw error;
      toast.success('Settings saved');
      refetchProject();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !project) {
    return (
      <div className="p-6 space-y-4">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-32" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Project Settings</h1>

      {/* Project Info */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5 mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-400" />
          General
        </h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-1 block">
              Project Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-1 block">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm resize-none h-20 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>

      {/* Members */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            Members ({members.length})
          </h2>
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg text-sm transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Invite
          </button>
        </div>
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between p-3 bg-[var(--background)] rounded-lg">
              <div className="flex items-center gap-3">
                {m.profile?.avatar_url ? (
                  <img src={m.profile.avatar_url} className="w-8 h-8 rounded-full" alt="" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <Users className="w-4 h-4 text-blue-400" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">{m.profile?.display_name || 'Unknown'}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">{m.profile?.email}</p>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${
                m.role === 'owner' ? 'bg-blue-500/20 text-blue-400' : 'bg-[var(--card)] text-[var(--muted-foreground)]'
              }`}>
                {m.role}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Invite Code */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
        <h2 className="text-lg font-semibold mb-2">Invite Code</h2>
        <p className="text-sm text-[var(--muted-foreground)] mb-3">
          Share this code with collaborators to let them join the project.
        </p>
        <div className="flex items-center gap-3">
          <code className="px-4 py-2 bg-[var(--background)] rounded-lg font-mono text-lg tracking-wider">
            {project.invite_code}
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(project.invite_code);
              toast.success('Copied');
            }}
            className="px-3 py-2 text-sm bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors"
          >
            Copy
          </button>
        </div>
      </div>

      {showInvite && (
        <InviteModal
          inviteCode={project.invite_code}
          onClose={() => setShowInvite(false)}
        />
      )}
    </div>
  );
}
