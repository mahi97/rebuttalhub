'use client';

import { useParams } from 'next/navigation';
import { useProject } from '@/hooks/useProject';
import { useReviews } from '@/hooks/useReviews';
import FileUploader from '@/components/project/FileUploader';
import { FileText, MessageSquare, Users, CheckCircle, AlertCircle } from 'lucide-react';
import { TASK_STATUSES } from '@/types';
import { calculateWeightedTaskProgress } from '@/lib/utils';

export default function ProjectOverviewPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { project, members, files, loading, refetchFiles } = useProject(projectId);
  const { reviews, reviewPoints } = useReviews(projectId);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-4 w-96" />
        <div className="grid grid-cols-3 gap-4 mt-6">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 text-center">
        <p className="text-[var(--muted-foreground)]">Project not found.</p>
      </div>
    );
  }

  const statusCounts = TASK_STATUSES.map((s) => ({
    ...s,
    count: reviewPoints.filter((p) => p.status === s.key).length,
  }));

  const progress = calculateWeightedTaskProgress(reviewPoints);

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">{project.name}</h1>
        {project.description && (
          <p className="text-[var(--muted-foreground)]">{project.description}</p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
          <div className="flex items-center gap-2 text-[var(--muted-foreground)] mb-1">
            <FileText className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wider">Files</span>
          </div>
          <p className="text-2xl font-bold">{files.length}</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
          <div className="flex items-center gap-2 text-[var(--muted-foreground)] mb-1">
            <MessageSquare className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wider">Reviews</span>
          </div>
          <p className="text-2xl font-bold">{reviews.length}</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
          <div className="flex items-center gap-2 text-[var(--muted-foreground)] mb-1">
            <AlertCircle className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wider">Points</span>
          </div>
          <p className="text-2xl font-bold">{reviewPoints.length}</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
          <div className="flex items-center gap-2 text-[var(--muted-foreground)] mb-1">
            <CheckCircle className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wider">Workflow Progress</span>
          </div>
          <p className="text-2xl font-bold text-blue-400">{progress}%</p>
        </div>
      </div>

      {/* Progress bar */}
      {reviewPoints.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium">Task Status Distribution</span>
            <span className="text-xs text-[var(--muted-foreground)]">
              weighted by kanban stage
            </span>
          </div>
          <div className="flex h-4 rounded-full overflow-hidden bg-[var(--background)]">
            {statusCounts.map((s) => (
              s.count > 0 && (
                <div
                  key={s.key}
                  className="h-full transition-all"
                  style={{
                    width: `${(s.count / reviewPoints.length) * 100}%`,
                    backgroundColor: s.color,
                  }}
                  title={`${s.label}: ${s.count}`}
                />
              )
            ))}
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            {statusCounts.filter((s) => s.count > 0).map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-xs">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}: {s.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* File Upload */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Upload Files</h2>
        <FileUploader projectId={projectId} onUploadComplete={refetchFiles} />
      </div>

      {/* Uploaded Files */}
      {files.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Uploaded Files</h2>
          <div className="space-y-2">
            {files.map((file) => (
              <div key={file.id} className="flex items-center gap-3 bg-[var(--card)] rounded-lg border border-[var(--border)] p-3">
                <FileText className="w-5 h-5 text-blue-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{file.file_name}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {file.file_type.toUpperCase()} &middot; {file.file_size ? `${(file.file_size / 1024).toFixed(0)} KB` : ''}
                  </p>
                </div>
                {file.extracted_markdown ? (
                  <span className="text-xs text-green-400">Processed</span>
                ) : (
                  <span className="text-xs text-[var(--muted-foreground)]">Pending</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Members */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-3">Team Members</h2>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-2 bg-[var(--card)] rounded-lg border border-[var(--border)] px-3 py-2">
              {m.profile?.avatar_url ? (
                <img src={m.profile.avatar_url} className="w-6 h-6 rounded-full" alt="" />
              ) : (
                <Users className="w-4 h-4 text-blue-400" />
              )}
              <span className="text-sm">{m.profile?.display_name || m.profile?.email}</span>
              {m.role === 'owner' && (
                <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">Owner</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
