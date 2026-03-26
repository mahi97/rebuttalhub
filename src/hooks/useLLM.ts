'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';

export function useLLM() {
  const [loading, setLoading] = useState(false);

  const callLLM = useCallback(
    async <T = string>(endpoint: string, body: Record<string, unknown>): Promise<T | null> => {
      setLoading(true);
      try {
        const res = await fetch(`/api/llm/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Request failed' }));
          if (res.status === 400 && err.error?.includes('API key')) {
            toast.error('Please set your Anthropic API key in Settings');
          } else {
            toast.error(err.error || 'LLM request failed');
          }
          return null;
        }

        const data = await res.json();
        return data as T;
      } catch {
        toast.error('Failed to reach LLM service');
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { callLLM, loading };
}
