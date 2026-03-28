'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageCircle, Check, ChevronDown, ChevronUp, Send, Loader2, Reply } from 'lucide-react';
import { formatRelativeDate, getInitials } from '@/lib/utils';
import type { Comment, Profile } from '@/types';
import toast from 'react-hot-toast';
import AutoResizeTextarea from '@/components/ui/AutoResizeTextarea';

interface CommentsSectionProps {
  reviewPointId: string;
  projectId: string;
  members: { user_id: string; profile: Profile }[];
}

type CommentNode = Comment & {
  profile?: Profile;
  replies: CommentNode[];
};

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

  const threadedComments = useMemo(() => {
    const commentsById = new Map<string, CommentNode>();

    commentsWithProfiles.forEach((comment) => {
      commentsById.set(comment.id, {
        ...comment,
        replies: [],
      });
    });

    const roots: CommentNode[] = [];

    commentsById.forEach((comment) => {
      if (comment.parent_comment_id) {
        const parent = commentsById.get(comment.parent_comment_id);
        if (parent) {
          parent.replies.push(comment);
          return;
        }
      }

      roots.push(comment);
    });

    return roots;
  }, [commentsWithProfiles]);

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

  const handleSubmit = async (content: string, parentCommentId: string | null = null) => {
    if (!content.trim()) return false;
    if (!parentCommentId) setSending(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('comments').insert({
        review_point_id: reviewPointId,
        project_id: projectId,
        user_id: user.id,
        parent_comment_id: parentCommentId,
        content: content.trim(),
      });

      if (error) throw error;
      await fetchComments();
      return true;
    } catch (err: any) {
      toast.error(err.message || 'Failed to add comment');
      return false;
    } finally {
      if (!parentCommentId) setSending(false);
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

  const unresolvedCount = commentsWithProfiles.filter((comment) => !comment.resolved).length;
  const resolvedCount = commentsWithProfiles.filter((comment) => comment.resolved).length;
  const unresolvedComments = threadedComments.filter((comment) => !comment.resolved);
  const resolvedComments = threadedComments.filter((comment) => comment.resolved);

  return (
    <div>
      <h4 className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <MessageCircle className="w-3.5 h-3.5" />
        Comments ({unresolvedCount} open{resolvedCount > 0 ? `, ${resolvedCount} resolved` : ''})
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
                      onResolve={handleResolve}
                      onReply={handleSubmit}
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
                      onResolve={handleResolve}
                      onReply={handleSubmit}
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
            <AutoResizeTextarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  const didSave = await handleSubmit(newComment);
                  if (didSave) setNewComment('');
                }
              }}
              placeholder="Add a comment..."
              className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              minHeight={44}
              maxHeight={160}
            />
            <button
              onClick={async () => {
                const didSave = await handleSubmit(newComment);
                if (didSave) setNewComment('');
              }}
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
  onReply,
}: {
  comment: CommentNode;
  onResolve: (commentId: string, resolved: boolean) => Promise<void>;
  onReply: (content: string, parentCommentId?: string | null) => Promise<boolean>;
}) {
  const displayName = comment.profile?.display_name || comment.profile?.email || 'User';
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const isResolved = comment.resolved;

  const handleReply = async () => {
    if (!replyText.trim()) return;

    setReplying(true);
    try {
      const didSave = await onReply(replyText, comment.id);
      if (didSave) {
        setReplyText('');
        setReplyOpen(false);
      }
    } finally {
      setReplying(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className={`flex gap-2 rounded-lg p-2 ${isResolved ? 'bg-green-500/5' : 'bg-[var(--background)]'}`}>
        {comment.profile?.avatar_url ? (
          <img src={comment.profile.avatar_url} className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5" alt="" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-medium text-blue-400">
            {getInitials(displayName)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium">{displayName}</span>
            <span className="text-[10px] text-[var(--muted-foreground)]">{formatRelativeDate(comment.created_at)}</span>
            {isResolved && (
              <span className="text-[10px] text-green-400 flex items-center gap-0.5">
                <Check className="w-2.5 h-2.5" /> Resolved
              </span>
            )}
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-sm">{comment.content}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setReplyOpen((prev) => !prev)}
              className="inline-flex items-center gap-1 text-[11px] text-[var(--muted-foreground)] transition-colors hover:text-white"
            >
              <Reply className="h-3 w-3" />
              Reply
            </button>
            <button
              onClick={() => onResolve(comment.id, !isResolved)}
              className={`text-[11px] transition-colors ${
                isResolved
                  ? 'text-[var(--muted-foreground)] hover:text-yellow-300'
                  : 'text-[var(--muted-foreground)] hover:text-green-400'
              }`}
            >
              {isResolved ? 'Reopen' : 'Resolve'}
            </button>
          </div>

          {replyOpen && (
            <div className="mt-3 space-y-2 rounded-lg border border-[var(--border)] bg-black/10 p-3">
              <AutoResizeTextarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    await handleReply();
                  }
                }}
                placeholder="Write a reply..."
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                minHeight={44}
                maxHeight={160}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setReplyOpen(false);
                    setReplyText('');
                  }}
                  className="rounded-md px-2 py-1 text-xs text-[var(--muted-foreground)] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReply}
                  disabled={replying || !replyText.trim()}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-500 px-3 py-1.5 text-xs text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                >
                  {replying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Reply
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {comment.replies.length > 0 && (
        <div className="ml-8 space-y-2 border-l border-[var(--border)] pl-3">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              onResolve={onResolve}
              onReply={onReply}
            />
          ))}
        </div>
      )}
    </div>
  );
}
