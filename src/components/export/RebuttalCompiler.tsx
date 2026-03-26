'use client';

import { useState, useMemo } from 'react';
import { Loader2, Sparkles, Scissors, Copy, Download, Check } from 'lucide-react';
import { useLLM } from '@/hooks/useLLM';
import CharacterCounter from './CharacterCounter';
import RebuttalPreview from './RebuttalPreview';
import toast from 'react-hot-toast';
import type { ReviewPoint, Review } from '@/types';

interface RebuttalCompilerProps {
  reviews: Review[];
  points: ReviewPoint[];
}

export default function RebuttalCompiler({ reviews, points }: RebuttalCompilerProps) {
  const [charLimit, setCharLimit] = useState(5000);
  const [selectedReviewer, setSelectedReviewer] = useState('all');
  const [rebuttal, setRebuttal] = useState('');
  const [copied, setCopied] = useState(false);
  const { callLLM, loading } = useLLM();

  const reviewerNames = useMemo(
    () => Array.from(new Set(reviews.map((r) => r.reviewer_name))),
    [reviews]
  );

  const filteredPoints = useMemo(() => {
    if (selectedReviewer === 'all') return points;
    return points.filter((p) => p.review?.reviewer_name === selectedReviewer);
  }, [points, selectedReviewer]);

  const responsesForCompile = useMemo(() => {
    return filteredPoints
      .filter((p) => p.final_response || p.draft_response)
      .map((p) => ({
        reviewer: p.review?.reviewer_name || 'Reviewer',
        section: p.section,
        point: p.point_text,
        response: p.final_response || p.draft_response || '',
      }));
  }, [filteredPoints]);

  const handleCompile = async () => {
    if (responsesForCompile.length === 0) {
      toast.error('No responses to compile. Draft responses for review points first.');
      return;
    }

    const result = await callLLM<{ rebuttal: string }>('compile-rebuttal', {
      responses: responsesForCompile,
      charLimit,
    });
    if (result) setRebuttal(result.rebuttal);
  };

  const handleReduceLength = async () => {
    if (!rebuttal) return;
    const result = await callLLM<{ rebuttal: string }>('reduce-length', {
      rebuttalText: rebuttal,
      charLimit,
    });
    if (result) setRebuttal(result.rebuttal);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(rebuttal);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (format: 'md' | 'txt') => {
    const blob = new Blob([rebuttal], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rebuttal.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-1 block">
            Reviewer
          </label>
          <select
            value={selectedReviewer}
            onChange={(e) => setSelectedReviewer(e.target.value)}
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All Reviewers</option>
            {reviewerNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-1 block">
            Character Limit
          </label>
          <input
            type="number"
            value={charLimit}
            onChange={(e) => setCharLimit(parseInt(e.target.value) || 5000)}
            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-1 block">
            Responses Ready
          </label>
          <p className="px-3 py-2 text-sm">
            <span className="text-blue-400 font-semibold">{responsesForCompile.length}</span>
            <span className="text-[var(--muted-foreground)]"> / {filteredPoints.length} points have responses</span>
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleCompile}
          disabled={loading || responsesForCompile.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate Rebuttal
        </button>

        {rebuttal && rebuttal.length > charLimit && (
          <button
            onClick={handleReduceLength}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
            Reduce Length
          </button>
        )}

        {rebuttal && (
          <>
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--card)] border border-[var(--border)] hover:border-blue-500/50 rounded-lg text-sm transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              Copy
            </button>
            <button
              onClick={() => handleDownload('md')}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--card)] border border-[var(--border)] hover:border-blue-500/50 rounded-lg text-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              .md
            </button>
            <button
              onClick={() => handleDownload('txt')}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--card)] border border-[var(--border)] hover:border-blue-500/50 rounded-lg text-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              .txt
            </button>
          </>
        )}
      </div>

      {/* Character Counter */}
      {rebuttal && <CharacterCounter current={rebuttal.length} limit={charLimit} />}

      {/* Editable Rebuttal */}
      {rebuttal && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Edit Rebuttal</h3>
            <span className="text-xs text-[var(--muted-foreground)]">
              Edit directly below. Changes update the character count in real-time.
            </span>
          </div>
          <textarea
            value={rebuttal}
            onChange={(e) => setRebuttal(e.target.value)}
            className="w-full h-64 bg-[var(--background)] border border-[var(--border)] rounded-lg p-4 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Preview */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Preview</h3>
        <RebuttalPreview content={rebuttal} />
      </div>
    </div>
  );
}
