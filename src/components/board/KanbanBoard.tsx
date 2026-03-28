'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { DragDropContext, Droppable, type DropResult } from '@hello-pangea/dnd';
import KanbanColumn from './KanbanColumn';
import TaskDetailModal from './TaskDetailModal';
import { TASK_STATUSES, type ReviewPoint, type TaskStatus, type Profile } from '@/types';
import { Archive, RotateCcw, Search } from 'lucide-react';
import { formatRelativeDate, truncate } from '@/lib/utils';
import toast from 'react-hot-toast';

interface KanbanBoardProps {
  points: ReviewPoint[];
  archivedPoints: ReviewPoint[];
  members: { user_id: string; profile: Profile }[];
  reviews: { id: string; reviewer_name: string }[];
  onUpdatePoint: (pointId: string, updates: Partial<ReviewPoint>) => Promise<void>;
  onRefresh: () => Promise<void>;
  paperContext?: string;
  pdfUrl?: string;
  paperMarkdown?: string;
}

export default function KanbanBoard({ points, archivedPoints, members, reviews, onUpdatePoint, onRefresh, paperContext, pdfUrl, paperMarkdown }: KanbanBoardProps) {
  const [selectedPoint, setSelectedPoint] = useState<ReviewPoint | null>(null);
  const [search, setSearch] = useState('');
  const [filterReviewer, setFilterReviewer] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskReviewer, setNewTaskReviewer] = useState('');
  const [newTaskSection, setNewTaskSection] = useState('Weakness');
  const [newTaskLabel, setNewTaskLabel] = useState('');
  const [newTaskText, setNewTaskText] = useState('');
  const [creating, setCreating] = useState(false);
  const [restoringTaskId, setRestoringTaskId] = useState('');
  const [boardScrollMetrics, setBoardScrollMetrics] = useState({ scrollWidth: 0, clientWidth: 0 });
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const scrollSyncSourceRef = useRef<'top' | 'bottom' | null>(null);

  // Get unique reviewers
  const reviewers = useMemo(() => {
    const names = new Set(points.map((p) => p.review?.reviewer_name).filter(Boolean));
    return Array.from(names) as string[];
  }, [points]);

  const mergeCandidates = useMemo(() => {
    if (!selectedPoint) return [];

    return points
      .filter((point) => point.id !== selectedPoint.id && point.review_id === selectedPoint.review_id)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [points, selectedPoint]);

  const getErrorMessage = useCallback(async (res: Response, fallback: string) => {
    const payload = await res.json().catch(() => null);
    return payload?.error || fallback;
  }, []);

  // Filter points
  const filteredPoints = useMemo(() => {
    return points.filter((p) => {
      if (search && !p.point_text.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterReviewer && p.review?.reviewer_name !== filterReviewer) return false;
      if (filterPriority && p.priority !== filterPriority) return false;
      if (filterAssignee && p.assigned_to !== filterAssignee) return false;
      return true;
    });
  }, [points, search, filterReviewer, filterPriority, filterAssignee]);

  // Group by status
  const columnData = useMemo(() => {
    const map = new Map<TaskStatus, ReviewPoint[]>();
    TASK_STATUSES.forEach((s) => map.set(s.key, []));
    filteredPoints.forEach((p) => {
      const col = map.get(p.status) || [];
      col.push(p);
      map.set(p.status, col);
    });
    return map;
  }, [filteredPoints]);

  const adjacentTasks = useMemo(() => {
    if (!selectedPoint) {
      return { prevTask: null, nextTask: null };
    }

    const orderedColumns = TASK_STATUSES.map((status) => columnData.get(status.key) || []);
    let currentColumnIndex = -1;
    let currentTaskIndex = -1;

    orderedColumns.some((columnPoints, columnIndex) => {
      const taskIndex = columnPoints.findIndex((point) => point.id === selectedPoint.id);
      if (taskIndex === -1) return false;
      currentColumnIndex = columnIndex;
      currentTaskIndex = taskIndex;
      return true;
    });

    if (currentColumnIndex === -1 || currentTaskIndex === -1) {
      return { prevTask: null, nextTask: null };
    }

    const currentColumn = orderedColumns[currentColumnIndex];
    let prevTask: ReviewPoint | null = null;
    let nextTask: ReviewPoint | null = null;

    if (currentTaskIndex > 0) {
      prevTask = currentColumn[currentTaskIndex - 1];
    } else {
      for (let columnIndex = currentColumnIndex - 1; columnIndex >= 0; columnIndex -= 1) {
        const previousColumn = orderedColumns[columnIndex];
        if (previousColumn.length > 0) {
          prevTask = previousColumn[previousColumn.length - 1];
          break;
        }
      }
    }

    if (currentTaskIndex < currentColumn.length - 1) {
      nextTask = currentColumn[currentTaskIndex + 1];
    } else {
      for (let columnIndex = currentColumnIndex + 1; columnIndex < orderedColumns.length; columnIndex += 1) {
        const followingColumn = orderedColumns[columnIndex];
        if (followingColumn.length > 0) {
          nextTask = followingColumn[0];
          break;
        }
      }
    }

    return { prevTask, nextTask };
  }, [columnData, selectedPoint]);

  const hasHorizontalOverflow = boardScrollMetrics.scrollWidth > boardScrollMetrics.clientWidth + 1;

  const updateBoardScrollMetrics = useCallback(() => {
    const boardEl = boardScrollRef.current;
    if (!boardEl) return;

    setBoardScrollMetrics({
      scrollWidth: boardEl.scrollWidth,
      clientWidth: boardEl.clientWidth,
    });
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateBoardScrollMetrics);
    return () => window.cancelAnimationFrame(frame);
  }, [updateBoardScrollMetrics, filteredPoints]);

  useEffect(() => {
    updateBoardScrollMetrics();

    const handleResize = () => updateBoardScrollMetrics();
    window.addEventListener('resize', handleResize);

    const boardEl = boardScrollRef.current;
    if (!boardEl || typeof ResizeObserver === 'undefined') {
      return () => window.removeEventListener('resize', handleResize);
    }

    const observer = new ResizeObserver(() => updateBoardScrollMetrics());
    observer.observe(boardEl);

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, [updateBoardScrollMetrics]);

  useEffect(() => {
    const topEl = topScrollRef.current;
    const boardEl = boardScrollRef.current;
    if (!topEl || !boardEl) return;

    const maxScrollLeft = Math.max(0, boardEl.scrollWidth - boardEl.clientWidth);
    if (boardEl.scrollLeft > maxScrollLeft) {
      boardEl.scrollLeft = maxScrollLeft;
    }
    topEl.scrollLeft = boardEl.scrollLeft;
  }, [boardScrollMetrics]);

  useEffect(() => {
    if (!selectedPoint) return;

    const hasSelectedPoint = points.some((point) => point.id === selectedPoint.id);
    if (!hasSelectedPoint) {
      setSelectedPoint(null);
    }
  }, [points, selectedPoint]);

  useEffect(() => {
    const isInteractiveTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.isContentEditable ||
        !!target.closest('input, textarea, select, button') ||
        !!target.closest('[contenteditable="true"]')
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (selectedPoint) return;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (isInteractiveTarget(event.target)) return;

      const boardEl = boardScrollRef.current;
      if (!boardEl || boardEl.scrollWidth <= boardEl.clientWidth) return;

      event.preventDefault();
      boardEl.scrollBy({
        left: event.key === 'ArrowRight' ? 320 : -320,
        behavior: 'smooth',
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPoint]);

  const handleTopScroll = useCallback(() => {
    const topEl = topScrollRef.current;
    const boardEl = boardScrollRef.current;
    if (!topEl || !boardEl) return;
    if (scrollSyncSourceRef.current === 'bottom') return;

    scrollSyncSourceRef.current = 'top';
    boardEl.scrollLeft = topEl.scrollLeft;
    window.requestAnimationFrame(() => {
      scrollSyncSourceRef.current = null;
    });
  }, []);

  const handleBoardScroll = useCallback(() => {
    const topEl = topScrollRef.current;
    const boardEl = boardScrollRef.current;
    if (!topEl || !boardEl) return;
    if (scrollSyncSourceRef.current === 'top') return;

    scrollSyncSourceRef.current = 'bottom';
    topEl.scrollLeft = boardEl.scrollLeft;
    window.requestAnimationFrame(() => {
      scrollSyncSourceRef.current = null;
    });
  }, []);

  const handleDragEnd = useCallback(
    async (result: DropResult) => {
      if (!result.destination) return;

      const { draggableId, destination } = result;
      const newStatus = destination.droppableId as TaskStatus;

      try {
        await onUpdatePoint(draggableId, { status: newStatus });
      } catch {
        toast.error('Failed to update task status');
      }
    },
    [onUpdatePoint]
  );

  const handleCardUpdate = useCallback(
    async (pointId: string, updates: Partial<ReviewPoint>) => {
      try {
        await onUpdatePoint(pointId, updates);
        setSelectedPoint((prev) => (prev?.id === pointId ? { ...prev, ...updates } : prev));
      } catch {
        toast.error('Failed to update task');
      }
    },
    [onUpdatePoint]
  );

  const handleCreateTask = async () => {
    if (!newTaskReviewer || !newTaskLabel.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewId: newTaskReviewer,
          projectId: points[0]?.project_id,
          section: newTaskSection,
          label: newTaskLabel,
          pointText: newTaskText,
          draftResponse: `> **${newTaskLabel}:** *${newTaskText.slice(0, 80)}*\n\n**Response ${newTaskLabel}:** `,
        }),
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to create task'));
      await onRefresh();
      setShowNewTask(false);
      setNewTaskLabel('');
      setNewTaskText('');
      toast.success('Task created');
    } catch (error: any) {
      toast.error(error.message || 'Failed to create task');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTask = useCallback(async (taskId: string) => {
    if (!confirm('Delete this task? You can restore it later from Archive.')) return;
    try {
      const res = await fetch('/api/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to archive task'));
      setSelectedPoint(null);
      await onRefresh();
      toast.success('Task moved to archive');
    } catch (error: any) {
      toast.error(error.message || 'Failed to archive task');
    }
  }, [getErrorMessage, onRefresh]);

  const handleSplitTask = useCallback(async (
    taskId: string,
    payload: { originalPointText: string; newPointText: string; newLabel: string }
  ) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'split', targetId: taskId, ...payload }),
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to split task'));
      setSelectedPoint(null);
      await onRefresh();
      toast.success('Task split');
    } catch (error: any) {
      toast.error(error.message || 'Failed to split task');
    }
  }, [getErrorMessage, onRefresh]);

  const handleMergeTask = useCallback(async (primaryTaskId: string, secondaryTaskId: string) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'merge',
          primaryId: primaryTaskId,
          secondaryId: secondaryTaskId,
        }),
      });

      if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to merge tasks'));

      setSelectedPoint(null);
      await onRefresh();
      toast.success('Tasks merged');
    } catch (error: any) {
      toast.error(error.message || 'Failed to merge tasks');
    }
  }, [getErrorMessage, onRefresh]);

  const handleRestoreTask = useCallback(async (taskId: string) => {
    setRestoringTaskId(taskId);
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'restore',
          targetId: taskId,
        }),
      });

      if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to restore task'));

      await onRefresh();
      toast.success('Task restored');
    } catch (error: any) {
      toast.error(error.message || 'Failed to restore task');
    } finally {
      setRestoringTaskId('');
    }
  }, [getErrorMessage, onRefresh]);

  return (
    <div className="h-full flex flex-col">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-9 pr-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <select
          value={filterReviewer}
          onChange={(e) => setFilterReviewer(e.target.value)}
          className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Reviewers</option>
          {reviewers.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
          className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Members</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.profile?.display_name || m.profile?.email}
            </option>
          ))}
        </select>

        {(search || filterReviewer || filterPriority || filterAssignee) && (
          <button
            onClick={() => { setSearch(''); setFilterReviewer(''); setFilterPriority(''); setFilterAssignee(''); }}
            className="px-3 py-2 text-xs text-blue-400 hover:text-blue-300"
          >
            Clear filters
          </button>
        )}

        <button
          onClick={() => setShowArchive((prev) => !prev)}
          className="flex items-center gap-2 px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs font-medium hover:border-blue-500/50 transition-colors"
        >
          <Archive className="w-4 h-4" />
          Archive ({archivedPoints.length})
        </button>

        <button
          onClick={() => setShowNewTask(!showNewTask)}
          className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-medium transition-colors"
        >
          + New Task
        </button>
      </div>

      {showArchive && (
        <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-4 mb-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Deleted Task Archive</h3>
            <p className="text-sm text-[var(--muted-foreground)]">
              Restoring a task brings it back to the board with its drafts, notes, and comments.
            </p>
          </div>

          {archivedPoints.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              No deleted tasks are currently archived.
            </p>
          ) : (
            <div className="space-y-2">
              {archivedPoints.map((point) => (
                <div
                  key={point.id}
                  className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{point.label || point.section}</span>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {point.review?.reviewer_name || 'Reviewer'}
                      </span>
                      {point.deleted_at && (
                        <span className="text-xs text-[var(--muted-foreground)]">
                          deleted {formatRelativeDate(point.deleted_at)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      {truncate(point.point_text, 180)}
                    </p>
                  </div>

                  <button
                    onClick={() => handleRestoreTask(point.id)}
                    disabled={restoringTaskId === point.id}
                    className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <RotateCcw className="w-4 h-4" />
                    {restoringTaskId === point.id ? 'Restoring...' : 'Restore'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New Task Form */}
      {showNewTask && (
        <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-4 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <select
              value={newTaskReviewer}
              onChange={(e) => setNewTaskReviewer(e.target.value)}
              className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select Reviewer</option>
              {reviews.map((r) => (
                <option key={r.id} value={r.id}>{r.reviewer_name}</option>
              ))}
            </select>
            <select
              value={newTaskSection}
              onChange={(e) => setNewTaskSection(e.target.value)}
              className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value="Weakness">Weakness</option>
              <option value="Question">Question</option>
              <option value="Limitation">Limitation</option>
              <option value="Other">Other</option>
            </select>
            <input
              value={newTaskLabel}
              onChange={(e) => setNewTaskLabel(e.target.value)}
              placeholder="Label (e.g. W5)"
              className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={handleCreateTask}
              disabled={creating || !newTaskReviewer || !newTaskLabel.trim()}
              className="bg-blue-500 hover:bg-blue-600 text-white rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
          <textarea
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            placeholder="Reviewer's comment text..."
            className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm h-20 resize-none"
          />
        </div>
      )}

      {/* Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <>
          {hasHorizontalOverflow && (
            <div
              ref={topScrollRef}
              onScroll={handleTopScroll}
              className="mb-3 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card)]/70"
              aria-hidden="true"
            >
              <div
                className="h-4"
                style={{ width: Math.max(boardScrollMetrics.scrollWidth, boardScrollMetrics.clientWidth) }}
              />
            </div>
          )}

          <div
            ref={boardScrollRef}
            onScroll={handleBoardScroll}
            className="kanban-board"
          >
            {TASK_STATUSES.map((status) => {
              const colPoints = columnData.get(status.key) || [];
              const isEmpty = colPoints.length === 0;
              return isEmpty ? (
                <CollapsedColumn key={status.key} status={status} />
              ) : (
              <KanbanColumn
                key={status.key}
                status={status}
                points={colPoints}
                onCardClick={setSelectedPoint}
              />
              );
            })}
          </div>
        </>
      </DragDropContext>

      {/* Detail Modal */}
      {selectedPoint && (
        <TaskDetailModal
          point={selectedPoint}
          members={members}
          mergeCandidates={mergeCandidates}
          prevTask={adjacentTasks.prevTask}
          nextTask={adjacentTasks.nextTask}
          onClose={() => setSelectedPoint(null)}
          onUpdate={handleCardUpdate}
          onNavigateTask={setSelectedPoint}
          onDelete={() => handleDeleteTask(selectedPoint.id)}
          onMerge={(targetTaskId) => handleMergeTask(selectedPoint.id, targetTaskId)}
          onSplit={(payload) => handleSplitTask(selectedPoint.id, payload)}
          paperContext={paperContext}
          pdfUrl={pdfUrl}
          paperMarkdown={paperMarkdown}
        />
      )}
    </div>
  );
}

function CollapsedColumn({ status }: { status: { key: string; label: string; color: string } }) {
  return (
    <Droppable droppableId={status.key}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`flex-shrink-0 w-10 rounded-lg transition-all ${
            snapshot.isDraggingOver ? 'bg-blue-500/10 ring-1 ring-blue-500/30 w-40' : ''
          }`}
        >
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: status.color }} />
            <span className="text-[10px] text-[var(--muted-foreground)] [writing-mode:vertical-lr] rotate-180">
              {status.label}
            </span>
          </div>
          <div className="hidden">{provided.placeholder}</div>
        </div>
      )}
    </Droppable>
  );
}
