'use client';

import { Droppable } from '@hello-pangea/dnd';
import TaskCard from './TaskCard';
import type { ReviewPoint, TaskStatus } from '@/types';

interface KanbanColumnProps {
  status: { key: TaskStatus; label: string; color: string };
  points: ReviewPoint[];
  onCardClick: (point: ReviewPoint) => void;
}

export default function KanbanColumn({ status, points, onCardClick }: KanbanColumnProps) {
  return (
    <div className="kanban-column">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: status.color }}
        />
        <h3 className="text-sm font-semibold">{status.label}</h3>
        <span className="text-xs text-[var(--muted-foreground)] bg-[var(--card)] px-2 py-0.5 rounded-full">
          {points.length}
        </span>
      </div>

      <Droppable droppableId={status.key}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`space-y-2 min-h-[200px] p-2 rounded-lg transition-colors ${
              snapshot.isDraggingOver ? 'bg-blue-500/5 ring-1 ring-blue-500/20' : 'bg-[var(--background)]/50'
            }`}
          >
            {points.map((point, index) => (
              <TaskCard
                key={point.id}
                point={point}
                index={index}
                onClick={() => onCardClick(point)}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
