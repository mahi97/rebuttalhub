'use client';

import { useState, useMemo } from 'react';
import { Loader2, Sparkles, Scissors, Copy, Download } from 'lucide-react';
import { useLLM } from '@/hooks/useLLM';
import CharacterCounter from './CharacterCounter';
import RebuttalPreview from './RebuttalPreview';
import toast from 'react-hot-toast';
import type { ReviewPoint, Review, Project } from '@/types';
import { DEFAULT_REBUTTAL_TEMPLATE, DEFAULT_GUIDELINES } from '@/types';

interface RebuttalCompilerProps {
  reviews: Review[];
  points: ReviewPoint[];
  project: Project | null;
}

const ALL_REVIEWERS_KEY = '__all_reviewers__';

export default function RebuttalCompiler({ reviews, points, project }: RebuttalCompilerProps) {
  const [charLimit, setCharLimit] = useState(5000);
  const [rebuttals, setRebuttals] = useState<Record<string, string>>({});
  const [activeReviewer, setActiveReviewer] = useState<string>('');
  const { callLLM, loading } = useLLM();

  const template = project?.rebuttal_template || DEFAULT_REBUTTAL_TEMPLATE;
  const guidelines = project?.guidelines || DEFAULT_GUIDELINES;

  const reviewerNames = useMemo(
    () => reviews.map((r) => r.reviewer_name),
    [reviews]
  );

  const getReviewerPoints = (reviewerName: string) => {
    const review = reviews.find((r) => r.reviewer_name === reviewerName);
    if (!review) return [];
    return points
      .filter((p) => p.review_id === review.id)
      .sort((a, b) => a.sort_order - b.sort_order);
  };

  const buildMergedReviewerRebuttal = (reviewerName: string) => {
    const reviewerPoints = getReviewerPoints(reviewerName);
    const thankYouPoint = reviewerPoints.find((p) => p.section === 'Thank You');
    const responsePoints = reviewerPoints.filter((p) => p.section !== 'Thank You');

    let merged = '';

    const thankYou = thankYouPoint?.final_response || thankYouPoint?.draft_response || '';
    if (thankYou) {
      merged += thankYou.trim() + '\n\n';
    }

    for (const p of responsePoints) {
      const response = p.final_response || p.draft_response;
      if (!response) continue;

      merged += '---\n';
      merged += `> **${p.label}:** *${p.point_text.slice(0, 200)}${p.point_text.length > 200 ? '...' : ''}*\n\n`;
      merged += `**Response ${p.label}:** ${response}\n\n`;
    }

    return merged.trim();
  };

  const buildCombinedRebuttal = (sourceRebuttals: Record<string, string>) => {
    return reviewerNames
      .map((name) => {
        const text = sourceRebuttals[name]?.trim();
        if (!text) return null;
        return `# Rebuttal to ${name}\n\n${text}`;
      })
      .filter(Boolean)
      .join('\n\n***\n\n');
  };

  const handleCompileReviewer = async (reviewerName: string) => {
    const reviewerPoints = getReviewerPoints(reviewerName);
    const thankYouPoint = reviewerPoints.find((p) => p.section === 'Thank You');
    const responsePoints = reviewerPoints.filter((p) => p.section !== 'Thank You');

    const responses = responsePoints
      .filter((p) => p.final_response || p.draft_response)
      .map((p) => ({
        label: p.label || p.section,
        section: p.section,
        point: p.point_text,
        response: p.final_response || p.draft_response || '',
      }));

    if (responses.length === 0) {
      toast.error(`No responses ready for ${reviewerName}. Draft responses first.`);
      return;
    }

    const result = await callLLM<{ rebuttal: string }>('compile-rebuttal', {
      reviewerName,
      thankYouNote: thankYouPoint?.draft_response || thankYouPoint?.final_response || '',
      responses,
      template,
      guidelines,
      charLimit,
    });

    if (result) {
      setRebuttals((prev) => ({ ...prev, [reviewerName]: result.rebuttal }));
      setActiveReviewer(reviewerName);
    }
  };

  const handleCompileAll = async () => {
    for (const name of reviewerNames) {
      await handleCompileReviewer(name);
    }
    toast.success('All rebuttals compiled');
  };

  /** Merge without LLM - just concatenate responses using the template format */
  const handleMergeReviewer = (reviewerName: string) => {
    const merged = buildMergedReviewerRebuttal(reviewerName);

    if (!merged) {
      toast.error(`No responses to merge for ${reviewerName}`);
      return;
    }

    setRebuttals((prev) => ({ ...prev, [reviewerName]: merged }));
    setActiveReviewer(reviewerName);
    toast.success(`Merged ${reviewerName} rebuttal`);
  };

  const handleMergeAll = () => {
    const mergedByReviewer = reviewerNames.reduce<Record<string, string>>((acc, name) => {
      const merged = buildMergedReviewerRebuttal(name);
      if (merged) {
        acc[name] = merged;
      }
      return acc;
    }, {});

    const mergedCount = Object.keys(mergedByReviewer).length;

    if (mergedCount === 0) {
      toast.error('No responses to merge across reviewers');
      return;
    }

    setRebuttals((prev) => ({ ...prev, ...mergedByReviewer }));
    setActiveReviewer(ALL_REVIEWERS_KEY);
    toast.success(`Merged ${mergedCount} reviewer rebuttal${mergedCount > 1 ? 's' : ''}`);
  };

  const handleReduceLength = async (reviewerName: string) => {
    const text = rebuttals[reviewerName];
    if (!text) return;
    const result = await callLLM<{ rebuttal: string }>('reduce-length', {
      rebuttalText: text,
      charLimit,
    });
    if (result) {
      setRebuttals((prev) => ({ ...prev, [reviewerName]: result.rebuttal }));
    }
  };

  const handleCopy = async (reviewerName: string) => {
    await navigator.clipboard.writeText(rebuttals[reviewerName] || '');
    toast.success('Copied to clipboard');
  };

  const handleDownload = (reviewerName: string, format: 'md' | 'txt') => {
    const text = rebuttals[reviewerName] || '';
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rebuttal_${reviewerName.replace(/\s+/g, '_')}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = () => {
    for (const reviewerName of reviewerNames) {
      const text = rebuttals[reviewerName];
      if (!text) continue;
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rebuttal_${reviewerName.replace(/\s+/g, '_')}.md`;
      a.click();
      URL.revokeObjectURL(url);
    }

    // Also download combined
    const combined = buildCombinedRebuttal(rebuttals);
    if (combined) {
      const blob = new Blob([combined], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rebuttal_all_reviewers.md';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const isCombinedView = activeReviewer === ALL_REVIEWERS_KEY;
  const combinedRebuttal = buildCombinedRebuttal(rebuttals);
  const currentRebuttal = isCombinedView
    ? combinedRebuttal
    : activeReviewer
      ? rebuttals[activeReviewer] || ''
      : '';
  const activeTitle = isCombinedView ? 'All Reviewers' : activeReviewer;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-1 block">
            Character Limit (per reviewer)
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
            Reviewers
          </label>
          <p className="px-3 py-2 text-sm">
            {reviewerNames.length} reviewers &middot; {points.length} total points
          </p>
        </div>
      </div>

      {/* Per-reviewer compile buttons */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Compile Per Reviewer</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {reviewerNames.map((name) => {
            const rPoints = getReviewerPoints(name);
            const readyCount = rPoints.filter((p) => p.final_response || p.draft_response).length;
            const hasRebuttal = !!rebuttals[name];

            return (
              <div
                key={name}
                className={`bg-[var(--card)] rounded-lg border p-4 ${
                  activeReviewer === name ? 'border-blue-500/50' : 'border-[var(--border)]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{name}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {readyCount}/{rPoints.length} ready
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleMergeReviewer(name)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[var(--background)] border border-[var(--border)] hover:border-blue-500/50 rounded-md text-xs font-medium transition-colors"
                  >
                    Merge
                  </button>
                  <button
                    onClick={() => handleCompileReviewer(name)}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    {hasRebuttal ? 'AI Polish' : 'AI Compile'}
                  </button>
                  {hasRebuttal && (
                    <>
                      <button
                        onClick={() => setActiveReviewer(name)}
                        className="px-3 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded-md text-xs hover:border-blue-500/50"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleCopy(name)}
                        className="px-2 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded-md text-xs hover:border-blue-500/50"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleDownload(name, 'md')}
                        className="px-2 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded-md text-xs hover:border-blue-500/50"
                      >
                        <Download className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bulk actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleMergeAll}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--card)] border border-[var(--border)] hover:border-blue-500/50 rounded-lg font-medium text-sm transition-colors"
        >
          Merge All (no LLM)
        </button>
        <button
          onClick={handleCompileAll}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          AI Polish All
        </button>

        {Object.keys(rebuttals).length > 0 && (
          <button
            onClick={handleDownloadAll}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--card)] border border-[var(--border)] hover:border-blue-500/50 rounded-lg text-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            Download All (.md per reviewer + combined)
          </button>
        )}
      </div>

      {/* Active reviewer preview */}
      {activeReviewer && currentRebuttal && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">
              Rebuttal for {activeTitle}
            </h3>
            <div className="flex gap-2">
              {!isCombinedView && currentRebuttal.length > charLimit && (
                <button
                  onClick={() => handleReduceLength(activeReviewer)}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-xs transition-colors disabled:opacity-50"
                >
                  <Scissors className="w-3 h-3" />
                  Reduce Length
                </button>
              )}
            </div>
          </div>

          {!isCombinedView && (
            <CharacterCounter current={currentRebuttal.length} limit={charLimit} />
          )}
          {isCombinedView && (
            <p className="text-xs text-[var(--muted-foreground)]">
              Combined preview generated from the current reviewer rebuttals, with a divider between each reviewer.
            </p>
          )}

          <div className="mt-3">
            <textarea
              value={currentRebuttal}
              onChange={(e) => {
                if (isCombinedView) return;
                setRebuttals((prev) => ({ ...prev, [activeReviewer]: e.target.value }));
              }}
              readOnly={isCombinedView}
              className="w-full h-64 bg-[var(--background)] border border-[var(--border)] rounded-lg p-4 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="mt-3">
            <h4 className="text-xs font-medium text-[var(--muted-foreground)] mb-2">Preview</h4>
            <RebuttalPreview content={currentRebuttal} />
          </div>
        </div>
      )}
    </div>
  );
}
