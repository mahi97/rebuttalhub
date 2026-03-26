import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// POST: Create a new task
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { reviewId, projectId, section, label, pointText, draftResponse } = await request.json();

    const { data, error } = await supabase
      .from('review_points')
      .insert({
        review_id: reviewId,
        project_id: projectId,
        section: section || 'Other',
        label: label || '',
        point_text: pointText || '',
        draft_response: draftResponse || '',
        priority: 'medium',
        status: 'not_started',
        sort_order: 999,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ task: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: Merge tasks or delete task
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { action, taskIds, targetId } = await request.json();

    if (action === 'merge') {
      // Merge multiple tasks into one
      if (!taskIds || taskIds.length < 2) {
        return NextResponse.json({ error: 'Need at least 2 tasks to merge' }, { status: 400 });
      }

      const { data: tasks } = await supabase
        .from('review_points')
        .select('*')
        .in('id', taskIds)
        .order('sort_order', { ascending: true });

      if (!tasks || tasks.length < 2) {
        return NextResponse.json({ error: 'Tasks not found' }, { status: 404 });
      }

      // Keep the first task, merge content from others
      const primary = tasks[0];
      const mergedPointText = tasks.map((t) => t.point_text).join('\n\n');
      const mergedDraft = tasks.map((t) => t.draft_response).filter(Boolean).join('\n\n---\n\n');

      await supabase
        .from('review_points')
        .update({
          point_text: mergedPointText,
          draft_response: mergedDraft || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', primary.id);

      // Delete the other tasks
      const otherIds = taskIds.filter((id: string) => id !== primary.id);
      await supabase.from('review_points').delete().in('id', otherIds);

      return NextResponse.json({ success: true, mergedInto: primary.id });

    } else if (action === 'split') {
      // Split a task into two
      if (!targetId) return NextResponse.json({ error: 'targetId required' }, { status: 400 });

      const { data: task } = await supabase
        .from('review_points')
        .select('*')
        .eq('id', targetId)
        .single();

      if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

      // Create a new task with empty content, user will fill in
      const { data: newTask, error } = await supabase
        .from('review_points')
        .insert({
          review_id: task.review_id,
          project_id: task.project_id,
          section: task.section,
          label: `${task.label}b`,
          point_text: '(split from ' + task.label + ')',
          priority: task.priority,
          status: 'not_started',
          sort_order: task.sort_order + 1,
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, newTask });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Delete a task
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { taskId } = await request.json();
    if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });

    const { error } = await supabase.from('review_points').delete().eq('id', taskId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
