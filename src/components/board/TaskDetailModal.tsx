'use client';

import { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLLM } from '@/hooks/useLLM';
import { TASK_STATUSES, SECTION_COLORS, PRIORITY_COLORS, type ReviewPoint, type TaskStatus, type Profile } from '@/types';

interface TaskDetailModalProps {
  point: ReviewPoint;
  members: { user_id: string; profile: Profile }[];
  onClose: () => void;
  onUpdate: (pointId: string, updates: Partial<ReviewPoint>) => void;
  paperContext?: string;
}

export default function TaskDetailModal({
  point,
  members,
  onClose,
  onUpdate,
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

  const handleDraftAI = async () => {
    const result = await callLLM<{ draft: string }>('draft-response', {
      pointId: point.id,
      pointText: point.point_text,
      sectionName: point.section,
      paperContext: paperContext || '',
      mode: 'new',
    });
    if (result) setDraftResponse(result.draft);
  };

  const handleImproveAI = async () => {
    const result = await callLLM<{ draft: string }>('draft-response', {
      pointId: point.id,
      pointText: point.point_text,
      sectionName: point.section,
      currentDraft: draftResponse,
      mode: 'improve',
    });
    if (result) setDraftResponse(result.draft);
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

  const sectionClass = SECTION_COLORS[point.section] || SECTION_COLORS['Other'];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-auto py-8">
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] w-full max-w-3xl mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${sectionClass}`}>
              {point.section}
            </span>
            <span className="text-xs text-[var(--muted-foreground)]">
              {point.review?.reviewer_name || 'Reviewer'}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[calc(100vh-200px)] overflow-auto">
          {/* Reviewer Comment */}
          <div>
            <h4 className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-2">
              Reviewer Comment
            </h4>
            <div className="p-3 bg-[var(--background)] rounded-lg text-sm leading-relaxed markdown-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{point.point_text}</ReactMarkdown>
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
                  AI Draft
                </button>
                {draftResponse && (
                  <button
                    onClick={handleImproveAI}
                    disabled={llmLoading}
                    className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-md bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-50"
                  >
                    {llmLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    Improve
                  </button>
                )}
              </div>
            </div>
            <textarea
              value={draftResponse}
              onChange={(e) => setDraftResponse(e.target.value)}
              onBlur={handleSaveDraft}
              placeholder="Write or generate a draft response..."
              className="w-full h-32 bg-[var(--background)] border border-[var(--border)] rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Final Response */}
          <div>
            <h4 className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-2">
              Final Response
            </h4>
            <textarea
              value={finalResponse}
              onChange={(e) => setFinalResponse(e.target.value)}
              onBlur={handleSaveFinal}
              placeholder="Finalized response for export..."
              className="w-full h-24 bg-[var(--background)] border border-[var(--border)] rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Notes */}
          <div>
            <h4 className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-2">
              Notes
            </h4>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleSaveNotes}
              placeholder="Internal notes..."
              className="w-full h-20 bg-[var(--background)] border border-[var(--border)] rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
