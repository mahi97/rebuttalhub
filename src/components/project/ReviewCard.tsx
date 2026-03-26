'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Star, Sparkles, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLLM } from '@/hooks/useLLM';
import type { Review } from '@/types';

interface ReviewCardProps {
  review: Review;
  index: number;
}

export default function ReviewCard({ review, index }: ReviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState(review.summary);
  const { callLLM, loading: summarizing } = useLLM();

  const handleSummarize = async () => {
    const result = await callLLM<{ summary: string }>('summarize', {
      reviewId: review.id,
      reviewText: review.raw_text,
    });
    if (result) setSummary(result.summary);
  };

  const ratingNum = review.rating?.match(/\d+/)?.[0];

  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-sm font-bold text-blue-400">
            R{index + 1}
          </div>
          <div className="text-left">
            <h3 className="font-semibold">{review.reviewer_name}</h3>
            <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
              {review.rating && (
                <span className="flex items-center gap-1">
                  <Star className="w-3 h-3 text-yellow-400" />
                  Rating: {ratingNum || review.rating}
                </span>
              )}
              {review.confidence && (
                <span>Confidence: {review.confidence.match(/\d+/)?.[0] || review.confidence}</span>
              )}
            </div>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[var(--border)]">
          {/* Summary */}
          <div className="mt-3 mb-4">
            {summary ? (
              <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <p className="text-xs font-medium text-blue-400 mb-1">AI Summary</p>
                <p className="text-sm">{summary}</p>
              </div>
            ) : (
              <button
                onClick={handleSummarize}
                disabled={summarizing}
                className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
              >
                {summarizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Generate Summary
              </button>
            )}
          </div>

          {/* Full review content */}
          <div className="markdown-content text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {review.raw_text}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
