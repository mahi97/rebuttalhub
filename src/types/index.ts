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
  rebuttal_template: string | null;
  guidelines: string | null;
  archived_at?: string | null;
  archived_by?: string | null;
  archived_reason?: 'manual' | null;
  archived_metadata?: Record<string, unknown> | null;
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
  thank_you_note: string | null;
  sections: Record<string, string>;
  sort_order: number;
  created_at: string;
}

export interface ReviewPoint {
  id: string;
  review_id: string;
  project_id: string;
  section: PointSection;
  label: string; // "W1", "Q2", "L3", "Thank You"
  point_text: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: TaskStatus;
  assigned_to: string | null;
  draft_response: string | null;
  final_response: string | null;
  notes: string | null;
  sort_order: number;
  deleted_at?: string | null;
  deleted_by?: string | null;
  archived_reason?: 'deleted' | 'merged' | null;
  archived_metadata?: Record<string, unknown> | null;
  updated_at: string;
  created_at: string;
  review?: Review;
  assignee?: Profile;
}

export type PointSection = 'Weakness' | 'Question' | 'Limitation' | 'Thank You' | 'Other';

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

export interface Comment {
  id: string;
  review_point_id: string;
  project_id: string;
  user_id: string;
  parent_comment_id: string | null;
  content: string;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  profile?: Profile;
}

export interface ActivityLog {
  id: string;
  project_id: string;
  user_id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface RebuttalVersion {
  id: string;
  project_id: string;
  review_id: string | null;
  reviewer_name: string | null;
  scope: 'reviewer' | 'all';
  content: string;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RebuttalVersionChange {
  pointId: string;
  reviewId: string;
  reviewerName: string | null;
  label: string;
  previousFinalResponse: string | null;
  nextFinalResponse: string;
}

export interface RebuttalVersionApplication {
  id: string;
  version_id: string;
  project_id: string;
  applied_by: string | null;
  change_set: RebuttalVersionChange[];
  reverted_at: string | null;
  reverted_by: string | null;
  created_at: string;
}

export const SECTION_COLORS: Record<string, string> = {
  Weakness: 'bg-red-500/20 text-red-400 border-red-500/30',
  Question: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Limitation: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'Thank You': 'bg-green-500/20 text-green-400 border-green-500/30',
  Other: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

export const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
};

export const DEFAULT_REBUTTAL_TEMPLATE = `<thank you note mentioning the good points they said about our paper and how we reflect on their concerns>.

---
> **W1:** *(Reviewer's exact words or a faithful paraphrase in italics for weaknesses)*

**Response W1:** <our response for it>
---
> **Q1:** *(Reviewer's exact words or a faithful paraphrase in italics for questions)*

**Response Q1:** <our response for it>
---
> **L1:** *(Reviewer's exact words or a faithful paraphrase in italics for limitations)*

**Response L1:** <our response for it>
`;

export const DEFAULT_GUIDELINES = `# Rebuttal Writing Guidelines

## Tone & Style
- Be concise and direct — no filler sentences
- Cite specific locations (Table 2, §3.1, Appendix B)
- Acknowledge valid points honestly
- Show new data/results inline when possible
- Use neutral, professional language
- Do NOT be sycophantic or pad the thank-you note

## Response Format
- Each response should directly address the reviewer's concern
- If you agree and made a change, state exactly what changed and where
- If you disagree, be direct and evidence-based
- Simple factual answer: 2-4 sentences
- Substantive criticism: 1-3 paragraphs max

## Thank You Note
- 2-4 sentences, specific to this reviewer's strengths
- Reference concrete positive points they raised
- Avoid hollow openers like "We are grateful for the valuable review"
`;
