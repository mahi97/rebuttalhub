'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Sparkles, Loader2, ChevronDown, Minimize2, Code, Eye, ChevronLeft, ChevronRight, RotateCcw, Save, FileText } from 'lucide-react';
import MarkdownViewer from '@/components/ui/MarkdownViewer';
import AutoResizeTextarea from '@/components/ui/AutoResizeTextarea';
import CommentsSection from './CommentsSection';
import { useLLM } from '@/hooks/useLLM';
import { truncate } from '@/lib/utils';
import { TASK_STATUSES, SECTION_COLORS, PRIORITY_COLORS, type ReviewPoint, type TaskStatus, type Profile } from '@/types';

interface EditableTaskState {
  draftResponse: string;
  finalResponse: string;
  notes: string;
  status: TaskStatus;
  priority: ReviewPoint['priority'];
  assignedTo: string;
}

interface TaskDetailModalProps {
  point: ReviewPoint;
  members: { user_id: string; profile: Profile }[];
  mergeCandidates?: ReviewPoint[];
  prevTask?: ReviewPoint | null;
  nextTask?: ReviewPoint | null;
  onClose: () => void;
  onUpdate: (pointId: string, updates: Partial<ReviewPoint>) => Promise<void>;
  onNavigateTask?: (point: ReviewPoint) => void;
  onDelete?: () => void;
  onMerge?: (targetTaskId: string) => Promise<void>;
  onSplit?: (payload: { originalPointText: string; newPointText: string; newLabel: string }) => Promise<void>;
  paperContext?: string;
  pdfUrl?: string;
  paperMarkdown?: string;
}

function buildEditableState(point: ReviewPoint): EditableTaskState {
  return {
    draftResponse: point.draft_response || '',
    finalResponse: point.final_response || '',
    notes: point.notes || '',
    status: point.status,
    priority: point.priority,
    assignedTo: point.assigned_to || '',
  };
}

function getDefaultSplitLabel(point: ReviewPoint) {
  return point.label
    ? (point.label.endsWith('b') ? `${point.label}2` : `${point.label}b`)
    : `${point.section}b`;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.isContentEditable ||
    !!target.closest('input, textarea, select, button') ||
    !!target.closest('[contenteditable="true"]')
  );
}

export default function TaskDetailModal({
  point,
  members,
  mergeCandidates = [],
  prevTask = null,
  nextTask = null,
  onClose,
  onUpdate,
  onNavigateTask,
  onDelete,
  onMerge,
  onSplit,
  paperContext,
  pdfUrl,
  paperMarkdown,
}: TaskDetailModalProps) {
  const lastPointIdRef = useRef<string | null>(null);
  const [savedState, setSavedState] = useState<EditableTaskState>(() => buildEditableState(point));
  const [draftResponse, setDraftResponse] = useState(savedState.draftResponse);
  const [draftView, setDraftView] = useState<'markdown' | 'preview'>('markdown');
  const [finalResponse, setFinalResponse] = useState(savedState.finalResponse);
  const [notes, setNotes] = useState(savedState.notes);
  const [status, setStatus] = useState<TaskStatus>(savedState.status);
  const [priority, setPriority] = useState(savedState.priority);
  const [assignedTo, setAssignedTo] = useState(savedState.assignedTo);
  const [showMergePanel, setShowMergePanel] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [merging, setMerging] = useState(false);
  const [showSplitPanel, setShowSplitPanel] = useState(false);
  const [splitOriginalText, setSplitOriginalText] = useState(point.point_text || '');
  const [splitNewText, setSplitNewText] = useState('');
  const [splitNewLabel, setSplitNewLabel] = useState(getDefaultSplitLabel(point));
  const [splitting, setSplitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sidePanel, setSidePanel] = useState<'none' | 'pdf' | 'markdown'>('none');
  const [pendingAction, setPendingAction] = useState<
    | { type: 'close' }
    | { type: 'navigate'; target: ReviewPoint; direction: 'previous' | 'next' }
    | null
  >(null);
  const { callLLM, loading: llmLoading } = useLLM();
  const isDirty = (
    draftResponse !== savedState.draftResponse ||
    finalResponse !== savedState.finalResponse ||
    notes !== savedState.notes ||
    status !== savedState.status ||
    priority !== savedState.priority ||
    assignedTo !== savedState.assignedTo
  );

  const applyEditableState = (nextState: EditableTaskState) => {
    setDraftResponse(nextState.draftResponse);
    setFinalResponse(nextState.finalResponse);
    setNotes(nextState.notes);
    setStatus(nextState.status);
    setPriority(nextState.priority);
    setAssignedTo(nextState.assignedTo);
  };

  useEffect(() => {
    if (lastPointIdRef.current === point.id) {
      return;
    }

    lastPointIdRef.current = point.id;
    const nextSavedState = buildEditableState(point);
    setSavedState(nextSavedState);
    applyEditableState(nextSavedState);
    setDraftView('markdown');
    setShowMergePanel(false);
    setMergeTargetId('');
    setShowSplitPanel(false);
    setSplitOriginalText(point.point_text || '');
    setSplitNewText('');
    setSplitNewLabel(getDefaultSplitLabel(point));
    setPendingAction(null);
  }, [point]);

  const runPendingAction = useCallback((action: NonNullable<typeof pendingAction>) => {
    if (action.type === 'close') {
      onClose();
      return;
    }

    onNavigateTask?.(action.target);
  }, [onClose, onNavigateTask]);

  const requestAction = useCallback((action: NonNullable<typeof pendingAction>) => {
    if (isDirty) {
      setPendingAction(action);
      return;
    }

    runPendingAction(action);
  }, [isDirty, runPendingAction]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (isEditableTarget(event.target)) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        requestAction({ type: 'close' });
        return;
      }

      if (event.key === 'ArrowLeft' && prevTask) {
        event.preventDefault();
        requestAction({ type: 'navigate', target: prevTask, direction: 'previous' });
        return;
      }

      if (event.key === 'ArrowRight' && nextTask) {
        event.preventDefault();
        requestAction({ type: 'navigate', target: nextTask, direction: 'next' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextTask, prevTask, requestAction]);

  const handleStatusChange = (newStatus: TaskStatus) => {
    setStatus(newStatus);
  };

  const handlePriorityChange = (newPriority: string) => {
    setPriority(newPriority as ReviewPoint['priority']);
  };

  const handleAssignChange = (userId: string) => {
    setAssignedTo(userId);
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

  const handleSaveChanges = async () => {
    if (!isDirty) return true;

    setSaving(true);
    try {
      await onUpdate(point.id, {
        draft_response: draftResponse,
        final_response: finalResponse,
        notes,
        status,
        priority,
        assigned_to: assignedTo || null,
      });

      setSavedState({
        draftResponse,
        finalResponse,
        notes,
        status,
        priority,
        assignedTo,
      });

      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleCopyDraftToFinal = () => {
    setFinalResponse(draftResponse);
  };

  const handleDraftViewChange = (view: 'markdown' | 'preview') => {
    if (view !== draftView) setDraftView(view);
  };

  const handleUndoChanges = () => {
    applyEditableState(savedState);
  };

  const handlePendingDiscard = () => {
    const action = pendingAction;
    if (!action) return;

    applyEditableState(savedState);
    setPendingAction(null);
    runPendingAction(action);
  };

  const handlePendingSave = async () => {
    const action = pendingAction;
    if (!action) return;

    const didSave = await handleSaveChanges();
    if (!didSave) return;

    setPendingAction(null);
    runPendingAction(action);
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

  const handleSplitTasks = async () => {
    if (!onSplit) return;
    if (!splitOriginalText.trim() || !splitNewText.trim()) return;
    if (!confirm('Split this task into two tasks using the descriptions below?')) return;

    setSplitting(true);
    try {
      await onSplit({
        originalPointText: splitOriginalText.trim(),
        newPointText: splitNewText.trim(),
        newLabel: splitNewLabel.trim(),
      });
    } finally {
      setSplitting(false);
    }
  };

  const sectionClass = SECTION_COLORS[point.section] || SECTION_COLORS['Other'];

  return (
    <div
      className={`fixed inset-0 z-50 flex bg-black/60 backdrop-blur-sm ${sidePanel !== 'none' ? '' : 'items-start justify-center overflow-auto py-8'}`}
      onClick={(event) => {
        if (sidePanel === 'none' && event.target === event.currentTarget) {
          requestAction({ type: 'close' });
        }
      }}
    >
      <div className={`bg-[var(--card)] border border-[var(--border)] shadow-2xl flex flex-col ${sidePanel !== 'none' ? 'w-[50%] min-w-0 h-full rounded-l-xl rounded-r-none border-r-0' : 'rounded-xl w-full max-w-3xl mx-4'}`}>
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${sectionClass}`}>
              {point.label || point.section}
            </span>
            <span className="text-xs text-[var(--muted-foreground)]">
              {point.section} &middot; {point.review?.reviewer_name || 'Reviewer'}
            </span>
            {isDirty && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                Unsaved changes
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => prevTask && requestAction({ type: 'navigate', target: prevTask, direction: 'previous' })}
              disabled={!prevTask}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              title="Previous task"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <button
              onClick={() => nextTask && requestAction({ type: 'navigate', target: nextTask, direction: 'next' })}
              disabled={!nextTask}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              title="Next task"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
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
              <button
                onClick={() => setShowSplitPanel((prev) => !prev)}
                className="px-2 py-1 text-xs text-[var(--muted-foreground)] hover:text-white rounded hover:bg-white/10"
                title="Split task"
              >
                Split
              </button>
            )}
            {onDelete && (
              <button onClick={onDelete} className="px-2 py-1 text-xs text-red-400 hover:text-red-300 rounded hover:bg-red-500/10" title="Delete task">
                Delete
              </button>
            )}
            {(pdfUrl || paperMarkdown) && (
              <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border)] p-0.5">
                {pdfUrl && (
                  <button
                    onClick={() => setSidePanel((v) => v === 'pdf' ? 'none' : 'pdf')}
                    title={sidePanel === 'pdf' ? 'Hide PDF panel' : 'View PDF side-by-side'}
                    className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${sidePanel === 'pdf' ? 'bg-blue-500/20 text-blue-400' : 'text-[var(--muted-foreground)] hover:text-white hover:bg-white/10'}`}
                  >
                    <FileText className="w-3 h-3" />
                    PDF
                  </button>
                )}
                {paperMarkdown && (
                  <button
                    onClick={() => setSidePanel((v) => v === 'markdown' ? 'none' : 'markdown')}
                    title={sidePanel === 'markdown' ? 'Hide paper panel' : 'View paper markdown side-by-side'}
                    className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${sidePanel === 'markdown' ? 'bg-blue-500/20 text-blue-400' : 'text-[var(--muted-foreground)] hover:text-white hover:bg-white/10'}`}
                  >
                    <Eye className="w-3 h-3" />
                    Paper
                  </button>
                )}
              </div>
            )}
            <button onClick={() => requestAction({ type: 'close' })} className="p-1 rounded hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className={`p-5 space-y-5 overflow-auto ${sidePanel !== 'none' ? 'flex-1' : 'max-h-[calc(100vh-200px)]'}`}>
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

          {showSplitPanel && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 space-y-4">
              <div>
                <h4 className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-1">
                  Split Task
                </h4>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Rewrite the current task description and define the additional task that should be created from it.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                  Current Task Description
                </label>
                <AutoResizeTextarea
                  value={splitOriginalText}
                  onChange={(e) => setSplitOriginalText(e.target.value)}
                  className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  minHeight={100}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                    New Task Label
                  </label>
                  <input
                    value={splitNewLabel}
                    onChange={(e) => setSplitNewLabel(e.target.value)}
                    className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. W1b"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                    New Task Description
                  </label>
                  <AutoResizeTextarea
                    value={splitNewText}
                    onChange={(e) => setSplitNewText(e.target.value)}
                    placeholder="Describe the additional sub-task you want to create from this reviewer comment..."
                    className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    minHeight={100}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSplitTasks}
                  disabled={!splitOriginalText.trim() || !splitNewText.trim() || splitting}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {splitting ? 'Splitting...' : 'Split into two tasks'}
                </button>
              </div>
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

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-4">
          <p className="text-xs text-[var(--muted-foreground)]">
            {isDirty ? 'You have unsaved changes in this task.' : 'Changes are saved for this task.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleUndoChanges}
              disabled={!isDirty || saving}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted-foreground)] transition-colors hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              Undo changes
            </button>
            <button
              onClick={handleSaveChanges}
              disabled={!isDirty || saving}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </button>
          </div>
        </div>
      </div>

      {/* Side panels — both are ALWAYS mounted in the DOM so the browser
           preserves their scroll/page position when toggling. Only the
           container's display property changes. */}

      {/* PDF panel */}
      <div
        style={{ display: sidePanel === 'pdf' ? 'flex' : 'none' }}
        className="w-[50%] min-w-0 h-full flex-col bg-[var(--background)] border border-[var(--border)] rounded-r-xl overflow-hidden"
      >
        {pdfUrl ? (
          <iframe
            src={pdfUrl}
            className="w-full h-full border-0"
            title="Paper PDF"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm">
            No PDF uploaded for this project.
          </div>
        )}
      </div>

      {/* Markdown (LaTeX paper) panel */}
      <div
        style={{ display: sidePanel === 'markdown' ? 'flex' : 'none' }}
        className="w-[50%] min-w-0 h-full flex-col bg-[var(--background)] border border-[var(--border)] rounded-r-xl overflow-hidden"
      >
        {paperMarkdown ? (
          <div className="flex-1 overflow-auto p-4 prose prose-invert prose-sm max-w-none">
            <MarkdownViewer content={paperMarkdown} showToggle={false} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm">
            No LaTeX source processed for this project.
          </div>
        )}
      </div>

      {pendingAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl">
            <h3 className="text-base font-semibold">Unsaved changes</h3>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              {pendingAction.type === 'close'
                ? 'This task has unsaved edits. Do you want to save them before closing?'
                : `This task has unsaved edits. Do you want to save them before opening the ${pendingAction.direction} task?`}
            </p>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setPendingAction(null)}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted-foreground)] transition-colors hover:border-white/20 hover:text-white"
              >
                Keep editing
              </button>
              <button
                onClick={handlePendingDiscard}
                className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/15"
              >
                Discard changes
              </button>
              <button
                onClick={handlePendingSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save and continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
