'use client';

import { useState, useMemo, useCallback } from 'react';
import { DragDropContext, Droppable, type DropResult } from '@hello-pangea/dnd';
import KanbanColumn from './KanbanColumn';
import TaskDetailModal from './TaskDetailModal';
import { TASK_STATUSES, type ReviewPoint, type TaskStatus, type Profile } from '@/types';
import { Search } from 'lucide-react';
import toast from 'react-hot-toast';

interface KanbanBoardProps {
  points: ReviewPoint[];
  members: { user_id: string; profile: Profile }[];
  reviews: { id: string; reviewer_name: string }[];
  onUpdatePoint: (pointId: string, updates: Partial<ReviewPoint>) => Promise<void>;
  onRefresh: () => void;
  paperContext?: string;
}

export default function KanbanBoard({ points, members, reviews, onUpdatePoint, onRefresh, paperContext }: KanbanBoardProps) {
  const [selectedPoint, setSelectedPoint] = useState<ReviewPoint | null>(null);
  const [search, setSearch] = useState('');
  const [filterReviewer, setFilterReviewer] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskReviewer, setNewTaskReviewer] = useState('');
  const [newTaskSection, setNewTaskSection] = useState('Weakness');
  const [newTaskLabel, setNewTaskLabel] = useState('');
  const [newTaskText, setNewTaskText] = useState('');
  const [creating, setCreating] = useState(false);

  // Get unique reviewers
  const reviewers = useMemo(() => {
    const names = new Set(points.map((p) => p.review?.reviewer_name).filter(Boolean));
    return Array.from(names) as string[];
  }, [points]);

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
      if (!res.ok) throw new Error('Failed to create task');
      toast.success('Task created');
      setShowNewTask(false);
      setNewTaskLabel('');
      setNewTaskText('');
      onRefresh();
    } catch {
      toast.error('Failed to create task');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTask = useCallback(async (taskId: string) => {
    if (!confirm('Delete this task?')) return;
    try {
      const res = await fetch('/api/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Task deleted');
      setSelectedPoint(null);
      onRefresh();
    } catch {
      toast.error('Failed to delete task');
    }
  }, [onRefresh]);

  const handleSplitTask = useCallback(async (taskId: string) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'split', targetId: taskId }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Task split');
      setSelectedPoint(null);
      onRefresh();
    } catch {
      toast.error('Failed to split task');
    }
  }, [onRefresh]);

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
          onClick={() => setShowNewTask(!showNewTask)}
          className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-medium transition-colors"
        >
          + New Task
        </button>
      </div>

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
        <div className="kanban-board">
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
      </DragDropContext>

      {/* Detail Modal */}
      {selectedPoint && (
        <TaskDetailModal
          point={selectedPoint}
          members={members}
          onClose={() => setSelectedPoint(null)}
          onUpdate={handleCardUpdate}
          onDelete={() => handleDeleteTask(selectedPoint.id)}
          onSplit={() => handleSplitTask(selectedPoint.id)}
          paperContext={paperContext}
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
