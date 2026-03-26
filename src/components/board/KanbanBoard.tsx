'use client';

import { useState, useMemo, useCallback } from 'react';
import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import KanbanColumn from './KanbanColumn';
import TaskDetailModal from './TaskDetailModal';
import { TASK_STATUSES, type ReviewPoint, type TaskStatus, type Profile } from '@/types';
import { Search } from 'lucide-react';
import toast from 'react-hot-toast';

interface KanbanBoardProps {
  points: ReviewPoint[];
  members: { user_id: string; profile: Profile }[];
  onUpdatePoint: (pointId: string, updates: Partial<ReviewPoint>) => Promise<void>;
  paperContext?: string;
}

export default function KanbanBoard({ points, members, onUpdatePoint, paperContext }: KanbanBoardProps) {
  const [selectedPoint, setSelectedPoint] = useState<ReviewPoint | null>(null);
  const [search, setSearch] = useState('');
  const [filterReviewer, setFilterReviewer] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');

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
        // Update selected point if it's the one being updated
        setSelectedPoint((prev) => (prev?.id === pointId ? { ...prev, ...updates } : prev));
      } catch {
        toast.error('Failed to update task');
      }
    },
    [onUpdatePoint]
  );

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
      </div>

      {/* Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="kanban-board">
          {TASK_STATUSES.map((status) => (
            <KanbanColumn
              key={status.key}
              status={status}
              points={columnData.get(status.key) || []}
              onCardClick={setSelectedPoint}
            />
          ))}
        </div>
      </DragDropContext>

      {/* Detail Modal */}
      {selectedPoint && (
        <TaskDetailModal
          point={selectedPoint}
          members={members}
          onClose={() => setSelectedPoint(null)}
          onUpdate={handleCardUpdate}
          paperContext={paperContext}
        />
      )}
    </div>
  );
}
