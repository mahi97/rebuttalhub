'use client';

import { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, ChevronDown, Minimize2, Code, Eye } from 'lucide-react';
import MarkdownViewer from '@/components/ui/MarkdownViewer';
import AutoResizeTextarea from '@/components/ui/AutoResizeTextarea';
import CommentsSection from './CommentsSection';
import { useLLM } from '@/hooks/useLLM';
import { truncate } from '@/lib/utils';
import { TASK_STATUSES, SECTION_COLORS, PRIORITY_COLORS, type ReviewPoint, type TaskStatus, type Profile } from '@/types';

interface TaskDetailModalProps {
  point: ReviewPoint;
  members: { user_id: string; profile: Profile }[];
  mergeCandidates?: ReviewPoint[];
  onClose: () => void;
  onUpdate: (pointId: string, updates: Partial<ReviewPoint>) => void;
  onDelete?: () => void;
  onMerge?: (targetTaskId: string) => Promise<void>;
  onSplit?: () => void;
  paperContext?: string;
}

export default function TaskDetailModal({
  point,
  members,
  mergeCandidates = [],
  onClose,
  onUpdate,
  onDelete,
  onMerge,
  onSplit,
  paperContext,
}: TaskDetailModalProps) {
  const [draftResponse, setDraftResponse] = useState(point.draft_response || '');
  const [draftView, setDraftView] = useState<'markdown' | 'preview'>('markdown');
  const [finalResponse, setFinalResponse] = useState(point.final_response || '');
  const [notes, setNotes] = useState(point.notes || '');
  const [status, setStatus] = useState<TaskStatus>(point.status);
  const [priority, setPriority] = useState(point.priority);
  const [assignedTo, setAssignedTo] = useState(point.assigned_to || '');
  const [showMergePanel, setShowMergePanel] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [merging, setMerging] = useState(false);
  const { callLLM, loading: llmLoading } = useLLM();

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleStatusChange = (newStatus: TaskStatus) => {
    setStatus(newStatus);
    onUpdate(point.id, { status: newStatus });
  };

  const handlePriorityChange = (newPriority: string) => {
    setPriority(newPriority as ReviewPoint['priority']);
    onUpdate(point.id, { priority: newPriority as ReviewPoint['priority'] });
  };

  const handleAssignChange = (userId: string) => {
    setAssignedTo(userId);
    onUpdate(point.id, { assigned_to: userId || null });
  };

  const callDraftLLM = async (mode: string, extraBody: Record<string, unknown> = {}) => {
    const result = await callLLM<{ draft: string }>('draft-response', {
      pointId: point.id,
      pointText: point.point_text,
      sectionName: point.section,
      label: point.label,
      paperContext: paperContext || '',
      projectId: point.project_id,
      reviewerName: point.review?.reviewer_name,
      mode,
      ...extraBody,
    });
    return result?.draft;
  };

  const handleDraftAI = async () => {
    const draft = await callDraftLLM('new');
    if (draft) setDraftResponse(draft);
  };

  const handleImproveAI = async () => {
    const draft = await callDraftLLM('improve', { currentDraft: draftResponse });
    if (draft) setDraftResponse(draft);
  };

  const handleShortenAI = async () => {
    const draft = await callDraftLLM('shorten', { currentDraft: draftResponse });
    if (draft) setDraftResponse(draft);
  };

  const handleSaveDraft = () => {
    onUpdate(point.id, { draft_response: draftResponse });
  };

  const handleSaveFinal = () => {
    onUpdate(point.id, { final_response: finalResponse });
  };

  const handleSaveNotes = () => {
    onUpdate(point.id, { notes });
  };

  const handleCopyDraftToFinal = () => {
    setFinalResponse(draftResponse);
    onUpdate(point.id, { final_response: draftResponse });
  };

  const handleDraftViewChange = (view: 'markdown' | 'preview') => {
    if (view === draftView) return;
    if (draftView === 'markdown') {
      handleSaveDraft();
    }
    setDraftView(view);
  };

  const handleMergeTasks = async () => {
    if (!onMerge || !mergeTargetId) return;
    if (!confirm('Merge this task with the selected one? The current task will stay and the other task will be removed.')) {
      return;
    }

    setMerging(true);
    try {
      await onMerge(mergeTargetId);
    } finally {
      setMerging(false);
    }
  };

  const sectionClass = SECTION_COLORS[point.section] || SECTION_COLORS['Other'];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-auto py-8">
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] w-full max-w-3xl mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${sectionClass}`}>
              {point.label || point.section}
            </span>
            <span className="text-xs text-[var(--muted-foreground)]">
              {point.section} &middot; {point.review?.reviewer_name || 'Reviewer'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {onMerge && (
              <button
                onClick={() => setShowMergePanel((prev) => !prev)}
                className="px-2 py-1 text-xs text-[var(--muted-foreground)] hover:text-white rounded hover:bg-white/10"
                title="Merge task"
              >
                Merge
              </button>
            )}
            {onSplit && (
              <button onClick={onSplit} className="px-2 py-1 text-xs text-[var(--muted-foreground)] hover:text-white rounded hover:bg-white/10" title="Split task">
                Split
              </button>
            )}
            {onDelete && (
              <button onClick={onDelete} className="px-2 py-1 text-xs text-red-400 hover:text-red-300 rounded hover:bg-red-500/10" title="Delete task">
                Delete
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5 max-h-[calc(100vh-200px)] overflow-auto">
          {/* Reviewer Comment with Markdown rendering */}
          <div>
            <h4 className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-2">
              {point.section === 'Thank You' ? 'Reviewer Strengths' : 'Reviewer Comment'}
            </h4>
            <div className="p-3 bg-[var(--background)] rounded-lg text-sm leading-relaxed">
              <MarkdownViewer content={point.point_text} showToggle />
            </div>
          </div>

          {/* Status */}
          <div>
            <h4 className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-2">
              Status
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {TASK_STATUSES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => handleStatusChange(s.key)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                    status === s.key
                      ? 'border-transparent text-white'
                      : 'border-[var(--border)] text-[var(--muted-foreground)] hover:text-white hover:border-white/20'
                  }`}
                  style={status === s.key ? { backgroundColor: s.color } : undefined}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority & Assignment */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-2">
                Priority
              </h4>
              <div className="flex gap-1.5">
                {(['critical', 'high', 'medium', 'low'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => handlePriorityChange(p)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-all capitalize ${
                      priority === p
                        ? 'border-transparent text-white'
                        : 'border-[var(--border)] text-[var(--muted-foreground)] hover:text-white'
                    }`}
                    style={priority === p ? { backgroundColor: PRIORITY_COLORS[p] } : undefined}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-2">
                Assigned to
              </h4>
              <div className="relative">
                <select
                  value={assignedTo}
                  onChange={(e) => handleAssignChange(e.target.value)}
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm appearance-none cursor-pointer"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.profile?.display_name || m.profile?.email || m.user_id}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)] pointer-events-none" />
              </div>
            </div>
          </div>

          {showMergePanel && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 space-y-3">
              <div>
                <h4 className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-1">
                  Merge Tasks
                </h4>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Merge this task with another task from the same reviewer. This task stays; the selected task is folded into it and then removed.
                </p>
              </div>

              {mergeCandidates.length > 0 ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Select task to merge</option>
                    {mergeCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.label || candidate.section} - {truncate(candidate.point_text, 80)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleMergeTasks}
                    disabled={!mergeTargetId || merging}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {merging ? 'Merging...' : 'Merge into this task'}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-[var(--muted-foreground)]">
                  No other tasks from this reviewer are available to merge.
                </p>
              )}
            </div>
          )}

          {/* Draft Response */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-3">
                <h4 className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                  Draft Response
                </h4>
                <div className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--background)] p-1">
                  <button
                    onClick={() => handleDraftViewChange('markdown')}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
                      draftView === 'markdown'
                        ? 'bg-blue-500/15 text-blue-400'
                        : 'text-[var(--muted-foreground)] hover:text-white'
                    }`}
                  >
                    <Code className="w-3 h-3" />
                    Markdown
                  </button>
                  <button
                    onClick={() => handleDraftViewChange('preview')}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
                      draftView === 'preview'
                        ? 'bg-blue-500/15 text-blue-400'
                        : 'text-[var(--muted-foreground)] hover:text-white'
                    }`}
                  >
                    <Eye className="w-3 h-3" />
                    Preview
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleDraftAI}
                  disabled={llmLoading}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                >
                  {llmLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {point.section === 'Thank You' ? 'AI Thank You' : 'AI Draft'}
                </button>
                {draftResponse && (
                  <>
                    <button
                      onClick={handleImproveAI}
                      disabled={llmLoading}
                      className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-md bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-50"
                    >
                      {llmLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Polish
                    </button>
                    <button
                      onClick={handleShortenAI}
                      disabled={llmLoading}
                      className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-md bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                    >
                      {llmLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Minimize2 className="w-3 h-3" />}
                      Shorten
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="bg-[var(--background)] border border-[var(--border)] rounded-lg overflow-hidden">
              {draftView === 'markdown' ? (
                <AutoResizeTextarea
                  value={draftResponse}
                  onChange={(e) => setDraftResponse(e.target.value)}
                  onBlur={handleSaveDraft}
                  placeholder={point.section === 'Thank You' ? 'Write or generate the thank-you note...' : 'Write or generate a draft response...'}
                  className="w-full bg-transparent p-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  minHeight={120}
                />
              ) : (
                <div className="min-h-[120px] p-3 text-sm">
                  {draftResponse ? (
                    <MarkdownViewer content={draftResponse} showToggle={false} />
                  ) : (
                    <p className="text-[var(--muted-foreground)]">
                      Draft preview will appear here once the response has content.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Final Response (collapsible) */}
          <details>
            <summary className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider cursor-pointer hover:text-white">
              Final Response {finalResponse && '(has content)'}
              {draftResponse && !finalResponse && (
                <button
                  onClick={(e) => { e.preventDefault(); handleCopyDraftToFinal(); }}
                  className="ml-2 text-blue-400 hover:text-blue-300 normal-case"
                >
                  Copy draft to final
                </button>
              )}
            </summary>
            <div className="mt-2">
              <AutoResizeTextarea
                value={finalResponse}
                onChange={(e) => setFinalResponse(e.target.value)}
                onBlur={handleSaveFinal}
                placeholder="Finalized response for export..."
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg p-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                minHeight={80}
              />
            </div>
          </details>

          {/* Notes (collapsible) */}
          <details>
            <summary className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider cursor-pointer hover:text-white">
              Notes {notes && '(has content)'}
            </summary>
            <div className="mt-2">
              <AutoResizeTextarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleSaveNotes}
                placeholder="Internal notes..."
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg p-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                minHeight={60}
              />
            </div>
          </details>

          {/* Comments */}
          <CommentsSection
            reviewPointId={point.id}
            projectId={point.project_id}
            members={members}
          />
        </div>
      </div>
    </div>
  );
}
