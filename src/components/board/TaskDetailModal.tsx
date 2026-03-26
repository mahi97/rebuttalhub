'use client';

import { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, ChevronDown, Minimize2 } from 'lucide-react';
import MarkdownViewer from '@/components/ui/MarkdownViewer';
import AutoResizeTextarea from '@/components/ui/AutoResizeTextarea';
import CommentsSection from './CommentsSection';
import { useLLM } from '@/hooks/useLLM';
import { TASK_STATUSES, SECTION_COLORS, PRIORITY_COLORS, type ReviewPoint, type TaskStatus, type Profile } from '@/types';

interface TaskDetailModalProps {
  point: ReviewPoint;
  members: { user_id: string; profile: Profile }[];
  onClose: () => void;
  onUpdate: (pointId: string, updates: Partial<ReviewPoint>) => void;
  onDelete?: () => void;
  onSplit?: () => void;
  paperContext?: string;
}

export default function TaskDetailModal({
  point,
  members,
  onClose,
  onUpdate,
  onDelete,
  onSplit,
  paperContext,
}: TaskDetailModalProps) {
  const [draftResponse, setDraftResponse] = useState(point.draft_response || '');
  const [finalResponse, setFinalResponse] = useState(point.final_response || '');
  const [notes, setNotes] = useState(point.notes || '');
  const [status, setStatus] = useState<TaskStatus>(point.status);
  const [priority, setPriority] = useState(point.priority);
  const [assignedTo, setAssignedTo] = useState(point.assigned_to || '');
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

          {/* Draft Response */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                Draft Response
              </h4>
              <div className="flex gap-2">
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
            <AutoResizeTextarea
              value={draftResponse}
              onChange={(e) => setDraftResponse(e.target.value)}
              onBlur={handleSaveDraft}
              placeholder={point.section === 'Thank You' ? 'Write or generate the thank-you note...' : 'Write or generate a draft response...'}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg p-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              minHeight={120}
            />
            {draftResponse && (
              <div className="mt-2">
                <details>
                  <summary className="text-xs text-[var(--muted-foreground)] cursor-pointer hover:text-white">
                    Preview rendered draft
                  </summary>
                  <div className="mt-2 p-3 bg-[var(--background)] rounded-lg">
                    <MarkdownViewer content={draftResponse} showToggle={false} />
                  </div>
                </details>
              </div>
            )}
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
