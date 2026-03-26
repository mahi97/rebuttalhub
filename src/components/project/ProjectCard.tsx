'use client';

import Link from 'next/link';
import { Users, MessageSquare } from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils';
import type { Project } from '@/types';

interface ProjectCardProps {
  project: Project & {
    memberCount?: number;
    reviewCount?: number;
    pointsTotal?: number;
    pointsDone?: number;
  };
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const progress = project.pointsTotal
    ? Math.round((project.pointsDone || 0) / project.pointsTotal * 100)
    : 0;

  return (
    <Link href={`/project/${project.id}`}>
      <div className="group bg-[var(--card)] rounded-xl border border-[var(--border)] p-5 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/5 transition-all cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-lg font-semibold group-hover:text-blue-400 transition-colors">
            {project.name}
          </h3>
          <span className="text-xs text-[var(--muted-foreground)]">
            {formatRelativeDate(project.updated_at)}
          </span>
        </div>

        {project.description && (
          <p className="text-sm text-[var(--muted-foreground)] mb-4 line-clamp-2">
            {project.description}
          </p>
        )}

        {project.pointsTotal !== undefined && project.pointsTotal > 0 && (
          <div className="mb-4">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[var(--muted-foreground)]">Progress</span>
              <span className="text-blue-400">{progress}%</span>
            </div>
            <div className="w-full h-2 bg-[var(--background)] rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-[var(--muted-foreground)]">
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {project.memberCount || 1}
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare className="w-3.5 h-3.5" />
            {project.reviewCount || 0} reviews
          </span>
        </div>
      </div>
    </Link>
  );
}
