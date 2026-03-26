'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Review, ReviewPoint } from '@/types';

export function useReviews(projectId: string) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewPoints, setReviewPoints] = useState<ReviewPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  const fetchReviews = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('reviews')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });
    setReviews(data || []);
  }, [projectId]);

  const fetchPoints = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('review_points')
      .select('*, review:reviews(*)')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setReviewPoints((data as any) || []);
  }, [projectId]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchReviews(), fetchPoints()]);
    setLoading(false);
  }, [fetchReviews, fetchPoints]);

  useEffect(() => {
    fetchedRef.current = false;
  }, [projectId]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchAll();
  }, [fetchAll]);

  const updatePoint = useCallback(
    async (pointId: string, updates: Partial<ReviewPoint>) => {
      const supabase = createClient();
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
    [fetchPoints]
  );

  const refetch = useCallback(async () => {
    await Promise.all([fetchReviews(), fetchPoints()]);
  }, [fetchReviews, fetchPoints]);

  return { reviews, reviewPoints, loading, refetch, updatePoint };
}
