import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TASK_STATUSES, type ReviewPoint, type TaskStatus } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatRelativeDate(date: string): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 10);
}

export function getTaskStatusProgressWeight(status: TaskStatus): number {
  const statusIndex = TASK_STATUSES.findIndex((taskStatus) => taskStatus.key === status);
  if (statusIndex <= 0) return 0;

  return statusIndex / (TASK_STATUSES.length - 1);
}

export function calculateWeightedTaskProgress(points: Array<Pick<ReviewPoint, 'status'>>): number {
  if (points.length === 0) return 0;

  const weightedProgress = points.reduce((total, point) => {
    return total + getTaskStatusProgressWeight(point.status);
  }, 0);

  return Math.round((weightedProgress / points.length) * 100);
}
