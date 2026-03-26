'use client';

import { useParams } from 'next/navigation';
import { useProject } from '@/hooks/useProject';
import { useReviews } from '@/hooks/useReviews';
import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates';
import KanbanBoard from '@/components/board/KanbanBoard';
import { useCallback } from 'react';

export default function BoardPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { members, files } = useProject(projectId);
  const { reviewPoints, loading, refetch, updatePoint } = useReviews(projectId);

  const handleRealtimeUpdate = useCallback(() => {
    refetch();
  }, [refetch]);

  useRealtimeUpdates(projectId, handleRealtimeUpdate);

  // Get paper context from PDF file for AI drafting
  const pdfFile = files.find((f) => f.file_type === 'pdf');
  const paperContext = pdfFile?.extracted_text?.slice(0, 3000) || '';

  if (loading) {
    return (
      <div className="p-6">
        <div className="skeleton h-8 w-48 mb-4" />
        <div className="flex gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-64 w-72" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold mb-1">Task Board</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Drag tasks between columns to update their status. Click a card for details.
        </p>
      </div>

      <KanbanBoard
        points={reviewPoints}
        members={members}
        onUpdatePoint={updatePoint}
        paperContext={paperContext}
      />
    </div>
  );
}
