'use client';

import { useParams } from 'next/navigation';
import { useProject } from '@/hooks/useProject';
import { useReviews } from '@/hooks/useReviews';
import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates';
import KanbanBoard from '@/components/board/KanbanBoard';
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function BoardPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { members, files } = useProject(projectId);
  const { reviews, reviewPoints, archivedReviewPoints, loading, refetch, updatePoint } = useReviews(projectId);
  const [pdfUrl, setPdfUrl] = useState<string | undefined>(undefined);

  const pdfFile = files.find((f) => f.file_type === 'pdf');
  const paperContext = pdfFile?.extracted_text?.slice(0, 3000) || '';

  useEffect(() => {
    if (!pdfFile?.storage_path) return;
    const supabase = createClient();
    supabase.storage
      .from('project-files')
      .createSignedUrl(pdfFile.storage_path, 14400) // 4-hour signed URL
      .then(({ data }) => { if (data?.signedUrl) setPdfUrl(data.signedUrl); });
  }, [pdfFile?.storage_path]);

  const handleRealtimeUpdate = useCallback(() => {
    refetch();
  }, [refetch]);

  useRealtimeUpdates(projectId, handleRealtimeUpdate);

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
        archivedPoints={archivedReviewPoints}
        members={members}
        reviews={reviews.map((r) => ({ id: r.id, reviewer_name: r.reviewer_name }))}
        onUpdatePoint={updatePoint}
        onRefresh={refetch}
        paperContext={paperContext}
        pdfUrl={pdfUrl}
      />
    </div>
  );
}
