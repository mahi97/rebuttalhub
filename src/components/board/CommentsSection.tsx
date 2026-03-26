'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageCircle, Check, ChevronDown, ChevronUp, Send, Loader2 } from 'lucide-react';
import { formatRelativeDate, getInitials } from '@/lib/utils';
import type { Comment, Profile } from '@/types';
import toast from 'react-hot-toast';

interface CommentsSectionProps {
  reviewPointId: string;
  projectId: string;
  members: { user_id: string; profile: Profile }[];
}

export default function CommentsSection({ reviewPointId, projectId, members }: CommentsSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [sending, setSending] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [loading, setLoading] = useState(true);

  const commentsWithProfiles = useMemo(() => {
    const profilesByUserId = new Map(
      members
        .filter((member) => member.profile)
        .map((member) => [member.user_id, member.profile])
    );

    return comments.map((comment) => ({
      ...comment,
      profile: profilesByUserId.get(comment.user_id),
    }));
  }, [comments, members]);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('review_point_id', reviewPointId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setComments(data || []);
    } catch (err: any) {
      setComments([]);
      toast.error(err.message || 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [reviewPointId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    setSending(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('comments').insert({
        review_point_id: reviewPointId,
        project_id: projectId,
        user_id: user.id,
        content: newComment.trim(),
      });

      if (error) throw error;
      setNewComment('');
      await fetchComments();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add comment');
    } finally {
      setSending(false);
    }
  };

  const handleResolve = async (commentId: string, resolved: boolean) => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('comments').update({
        resolved,
        resolved_by: resolved ? user?.id : null,
        resolved_at: resolved ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq('id', commentId);
      if (error) throw error;
      await fetchComments();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update comment');
    }
  };

  const unresolvedComments = commentsWithProfiles.filter((c) => !c.resolved);
  const resolvedComments = commentsWithProfiles.filter((c) => c.resolved);

  return (
    <div>
      <h4 className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <MessageCircle className="w-3.5 h-3.5" />
        Comments ({unresolvedComments.length} open{resolvedComments.length > 0 ? `, ${resolvedComments.length} resolved` : ''})
      </h4>

      {loading ? (
        <div className="skeleton h-12" />
      ) : (
        <>
          {/* Unresolved comments */}
          {unresolvedComments.length > 0 && (
            <div className="space-y-2 mb-3">
              {unresolvedComments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  onResolve={() => handleResolve(comment.id, true)}
                />
              ))}
            </div>
          )}

          {/* Resolved comments toggle */}
          {resolvedComments.length > 0 && (
            <div className="mb-3">
              <button
                onClick={() => setShowResolved(!showResolved)}
                className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] hover:text-white transition-colors"
              >
                {showResolved ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {resolvedComments.length} resolved comment{resolvedComments.length > 1 ? 's' : ''}
              </button>
              {showResolved && (
                <div className="space-y-2 mt-2 opacity-60">
                  {resolvedComments.map((comment) => (
                    <CommentItem
                      key={comment.id}
                      comment={comment}
                      onUnresolve={() => handleResolve(comment.id, false)}
                      isResolved
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {unresolvedComments.length === 0 && resolvedComments.length === 0 && (
            <p className="mb-3 text-sm text-[var(--muted-foreground)]">
              No comments yet.
            </p>
          )}

          {/* New comment input */}
          <div className="flex gap-2">
            <input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
              placeholder="Add a comment..."
              className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleSubmit}
              disabled={sending || !newComment.trim()}
              className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CommentItem({
  comment,
  onResolve,
  onUnresolve,
  isResolved = false,
}: {
  comment: Comment & { profile?: Profile };
  onResolve?: () => void;
  onUnresolve?: () => void;
  isResolved?: boolean;
}) {
  const displayName = comment.profile?.display_name || comment.profile?.email || 'User';

  return (
    <div className={`flex gap-2 p-2 rounded-lg ${isResolved ? 'bg-green-500/5' : 'bg-[var(--background)]'}`}>
      {comment.profile?.avatar_url ? (
        <img src={comment.profile.avatar_url} className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5" alt="" />
      ) : (
        <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-medium text-blue-400">
          {getInitials(displayName)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{displayName}</span>
          <span className="text-[10px] text-[var(--muted-foreground)]">{formatRelativeDate(comment.created_at)}</span>
          {isResolved && (
            <span className="text-[10px] text-green-400 flex items-center gap-0.5">
              <Check className="w-2.5 h-2.5" /> Resolved
            </span>
          )}
        </div>
        <p className="text-sm mt-0.5 whitespace-pre-wrap">{comment.content}</p>
      </div>
      {onResolve && !isResolved && (
        <button
          onClick={onResolve}
          className="flex-shrink-0 p-1 text-[var(--muted-foreground)] hover:text-green-400 transition-colors"
          title="Resolve"
        >
          <Check className="w-4 h-4" />
        </button>
      )}
      {onUnresolve && isResolved && (
        <button
          onClick={onUnresolve}
          className="flex-shrink-0 p-1 text-[var(--muted-foreground)] hover:text-yellow-400 transition-colors text-[10px]"
          title="Unresolve"
        >
          Reopen
        </button>
      )}
    </div>
  );
}
