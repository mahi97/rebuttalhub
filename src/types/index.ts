export interface Profile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string;
  anthropic_api_key: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  project_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  profile?: Profile;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  file_name: string;
  file_type: 'pdf' | 'html' | 'zip' | 'tex';
  storage_path: string;
  file_size: number | null;
  uploaded_by: string;
  extracted_text: string | null;
  extracted_markdown: string | null;
  html_content: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Review {
  id: string;
  project_id: string;
  reviewer_name: string;
  rating: string | null;
  confidence: string | null;
  raw_text: string;
  summary: string | null;
  sections: Record<string, string>;
  sort_order: number;
  created_at: string;
}

export interface ReviewPoint {
  id: string;
  review_id: string;
  project_id: string;
  section: string;
  point_text: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: TaskStatus;
  assigned_to: string | null;
  draft_response: string | null;
  final_response: string | null;
  notes: string | null;
  sort_order: number;
  updated_at: string;
  created_at: string;
  review?: Review;
  assignee?: Profile;
}

export type TaskStatus =
  | 'not_started'
  | 'in_progress'
  | 'need_experiments'
  | 'need_more_work'
  | 'prof_review'
  | 'polishing'
  | 'done';

export const TASK_STATUSES: { key: TaskStatus; label: string; color: string }[] = [
  { key: 'not_started', label: 'Not Started', color: '#6b7280' },
  { key: 'in_progress', label: 'In Progress', color: '#3b82f6' },
  { key: 'need_experiments', label: 'Need Experiments', color: '#f59e0b' },
  { key: 'need_more_work', label: 'Need More Work', color: '#ef4444' },
  { key: 'prof_review', label: 'Prof. Review', color: '#8b5cf6' },
  { key: 'polishing', label: 'Polishing', color: '#06b6d4' },
  { key: 'done', label: 'Done', color: '#22c55e' },
];

export interface ActivityLog {
  id: string;
  project_id: string;
  user_id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export const SECTION_COLORS: Record<string, string> = {
  Weakness: 'bg-red-500/20 text-red-400 border-red-500/30',
  Question: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Suggestion: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Strength: 'bg-green-500/20 text-green-400 border-green-500/30',
  'Minor Issue': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  Other: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

export const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
};
