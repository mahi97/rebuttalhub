'use client';

import { useParams } from 'next/navigation';
import { useReviews } from '@/hooks/useReviews';
import RebuttalCompiler from '@/components/export/RebuttalCompiler';

export default function ExportPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { reviews, reviewPoints, loading } = useReviews(projectId);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-32" />
        <div className="skeleton h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Export Rebuttal</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Compile your responses into a submission-ready rebuttal document.
        </p>
      </div>

      <RebuttalCompiler reviews={reviews} points={reviewPoints} />
    </div>
  );
}
