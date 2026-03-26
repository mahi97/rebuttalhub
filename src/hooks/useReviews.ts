'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Review, ReviewPoint } from '@/types';

export function useReviews(projectId: string) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewPoints, setReviewPoints] = useState<ReviewPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const fetchReviews = useCallback(async () => {
    const { data } = await supabase
      .from('reviews')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });
    setReviews(data || []);
  }, [projectId, supabase]);

  const fetchPoints = useCallback(async () => {
    const { data } = await supabase
      .from('review_points')
      .select('*, review:reviews(*)')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });
    setReviewPoints((data as any) || []);
  }, [projectId, supabase]);

  const fetch = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchReviews(), fetchPoints()]);
    setLoading(false);
  }, [fetchReviews, fetchPoints]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const updatePoint = useCallback(
    async (pointId: string, updates: Partial<ReviewPoint>) => {
      // Optimistic update
      setReviewPoints((prev) =>
        prev.map((p) => (p.id === pointId ? { ...p, ...updates } : p))
      );

      const { error } = await supabase
        .from('review_points')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', pointId);

      if (error) {
        // Revert on error
        await fetchPoints();
        throw error;
      }
    },
    [supabase, fetchPoints]
  );

  return { reviews, reviewPoints, loading, refetch: fetch, updatePoint };
}
