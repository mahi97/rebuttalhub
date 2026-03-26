'use client';

import { Draggable } from '@hello-pangea/dnd';
import { MessageSquare, User } from 'lucide-react';
import { truncate } from '@/lib/utils';
import { SECTION_COLORS, PRIORITY_COLORS, type ReviewPoint } from '@/types';

interface TaskCardProps {
  point: ReviewPoint;
  index: number;
  onClick: () => void;
}

export default function TaskCard({ point, index, onClick }: TaskCardProps) {
  const sectionClass = SECTION_COLORS[point.section] || SECTION_COLORS['Other'];
  const priorityColor = PRIORITY_COLORS[point.priority] || PRIORITY_COLORS['medium'];

  return (
    <Draggable draggableId={point.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`bg-[var(--card)] rounded-lg border border-[var(--border)] p-3 cursor-pointer hover:border-blue-500/30 transition-all ${
            snapshot.isDragging ? 'shadow-xl shadow-blue-500/10 ring-1 ring-blue-500/30' : ''
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full border ${sectionClass}`}>
              {point.section}
            </span>
            <div
              className="w-2 h-2 rounded-full ml-auto flex-shrink-0"
              style={{ backgroundColor: priorityColor }}
              title={`${point.priority} priority`}
            />
          </div>

          <p className="text-sm leading-relaxed mb-2">
            {truncate(point.point_text, 120)}
          </p>

          <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {point.review?.reviewer_name || 'Reviewer'}
            </span>
            <div className="flex items-center gap-2">
              {point.draft_response && (
                <span className="text-green-400" title="Draft exists">
                  &#10003;
                </span>
              )}
              {point.assigned_to && (
                <div className="w-5 h-5 rounded-full bg-blue-500/30 flex items-center justify-center">
                  <User className="w-3 h-3 text-blue-400" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}
