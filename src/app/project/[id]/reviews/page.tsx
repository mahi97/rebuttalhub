'use client';

import { useParams } from 'next/navigation';
import { useReviews } from '@/hooks/useReviews';
import ReviewCard from '@/components/project/ReviewCard';
import { MessageSquare } from 'lucide-react';

export default function ReviewsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { reviews, reviewPoints, loading } = useReviews(projectId);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="skeleton h-8 w-48" />
        {[1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Reviews</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            {reviews.length} reviews &middot; {reviewPoints.length} total points
          </p>
        </div>
      </div>

      {reviews.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-[var(--card)] flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-8 h-8 text-[var(--muted-foreground)]" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No reviews yet</h3>
          <p className="text-[var(--muted-foreground)]">
            Upload an OpenReview HTML file in the Overview tab to parse reviews.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review, index) => {
            const points = reviewPoints.filter((p) => p.review_id === review.id);
            return (
              <div key={review.id}>
                <ReviewCard review={review} index={index} />
                {points.length > 0 && (
                  <div className="ml-12 mt-2 mb-4">
                    <p className="text-xs text-[var(--muted-foreground)] mb-2">
                      {points.length} extracted points:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {['Weakness', 'Question', 'Suggestion', 'Strength', 'Minor Issue', 'Other'].map((section) => {
                        const count = points.filter((p) => p.section === section).length;
                        if (count === 0) return null;
                        const colorMap: Record<string, string> = {
                          Weakness: 'bg-red-500/20 text-red-400',
                          Question: 'bg-yellow-500/20 text-yellow-400',
                          Suggestion: 'bg-blue-500/20 text-blue-400',
                          Strength: 'bg-green-500/20 text-green-400',
                          'Minor Issue': 'bg-orange-500/20 text-orange-400',
                          Other: 'bg-slate-500/20 text-slate-400',
                        };
                        return (
                          <span key={section} className={`px-2 py-0.5 text-[10px] rounded-full ${colorMap[section]}`}>
                            {count} {section}{count > 1 ? 's' : ''}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
