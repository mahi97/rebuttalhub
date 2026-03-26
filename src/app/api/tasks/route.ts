import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const PRIORITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function joinNonEmpty(values: Array<string | null | undefined>, separator: string) {
  return values
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(separator) || null;
}

function buildMergedPointText(
  tasks: Array<{ label: string | null; section: string | null; point_text: string | null }>
) {
  return joinNonEmpty(
    tasks.map((task) => {
      const prefix = task.label?.trim() || task.section?.trim() || 'Task';
      const pointText = task.point_text?.trim() || '';
      return pointText ? `[${prefix}] ${pointText}` : `[${prefix}]`;
    }),
    '\n\n---\n\n'
  );
}

function buildMergedLabel(labels: Array<string | null | undefined>) {
  return Array.from(
    new Set(labels.map((label) => label?.trim()).filter(Boolean))
  ).join('+');
}

async function getAuthorizedClients() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const mutationClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createServiceClient()
    : supabase;

  return { supabase, mutationClient, user };
}

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

// PATCH: Merge or split tasks
export async function PATCH(request: Request) {
  try {
    const auth = await getAuthorizedClients();
    if (auth.error) return auth.error;

    const { supabase, mutationClient } = auth;

    const { action, taskIds, targetId, primaryId, secondaryId } = await request.json();

    if (action === 'merge') {
      const mergeIds = Array.from(
        new Set(
          [primaryId, secondaryId, ...(Array.isArray(taskIds) ? taskIds : [])].filter(Boolean)
        )
      );

      if (mergeIds.length !== 2) {
        return NextResponse.json({ error: 'Need exactly 2 tasks to merge' }, { status: 400 });
      }

      const { data: tasks, error: tasksError } = await supabase
        .from('review_points')
        .select('*')
        .in('id', mergeIds);

      if (tasksError) {
        return NextResponse.json({ error: tasksError.message }, { status: 500 });
      }

      if (!tasks || tasks.length !== 2) {
        return NextResponse.json({ error: 'Tasks not found' }, { status: 404 });
      }

      const taskMap = new Map(tasks.map((task) => [task.id, task]));
      const fallbackPrimary = [...tasks].sort((a, b) => a.sort_order - b.sort_order)[0];
      const primaryTask = (primaryId && taskMap.get(primaryId)) || fallbackPrimary;
      const secondaryTask = tasks.find((task) => task.id !== primaryTask.id);

      if (!secondaryTask) {
        return NextResponse.json({ error: 'Need two distinct tasks to merge' }, { status: 400 });
      }

      if (primaryTask.project_id !== secondaryTask.project_id) {
        return NextResponse.json({ error: 'Tasks must belong to the same project' }, { status: 400 });
      }

      if (primaryTask.review_id !== secondaryTask.review_id) {
        return NextResponse.json({ error: 'Only tasks from the same reviewer can be merged' }, { status: 400 });
      }

      const mergedPayload = {
        label: buildMergedLabel([primaryTask.label, secondaryTask.label]) || primaryTask.label || secondaryTask.label || '',
        section: primaryTask.section === secondaryTask.section ? primaryTask.section : 'Other',
        point_text: buildMergedPointText([primaryTask, secondaryTask]) || '',
        draft_response: joinNonEmpty(
          [primaryTask.draft_response, secondaryTask.draft_response],
          '\n\n---\n\n'
        ),
        final_response: joinNonEmpty(
          [primaryTask.final_response, secondaryTask.final_response],
          '\n\n---\n\n'
        ),
        notes: joinNonEmpty(
          [primaryTask.notes, secondaryTask.notes],
          '\n\n---\n\n'
        ),
        priority:
          (PRIORITY_RANK[secondaryTask.priority] || 0) > (PRIORITY_RANK[primaryTask.priority] || 0)
            ? secondaryTask.priority
            : primaryTask.priority,
        assigned_to: primaryTask.assigned_to || secondaryTask.assigned_to || null,
        updated_at: new Date().toISOString(),
      };

      const { data: mergedTask, error: updateError } = await mutationClient
        .from('review_points')
        .update(mergedPayload)
        .eq('id', primaryTask.id)
        .select('*')
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      const { error: commentsError } = await mutationClient
        .from('comments')
        .update({
          review_point_id: primaryTask.id,
          updated_at: new Date().toISOString(),
        })
        .eq('review_point_id', secondaryTask.id);

      if (commentsError) {
        return NextResponse.json({ error: commentsError.message }, { status: 500 });
      }

      const { data: deletedTask, error: deleteError } = await mutationClient
        .from('review_points')
        .delete()
        .eq('id', secondaryTask.id)
        .select('id')
        .maybeSingle();

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }

      if (!deletedTask) {
        return NextResponse.json(
          { error: 'The second task could not be removed after merging' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        mergedInto: primaryTask.id,
        mergedTask,
        deletedTaskId: secondaryTask.id,
      });

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
    const auth = await getAuthorizedClients();
    if (auth.error) return auth.error;

    const { supabase, mutationClient } = auth;

    const { taskId } = await request.json();
    if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });

    const { data: task, error: taskError } = await supabase
      .from('review_points')
      .select('id')
      .eq('id', taskId)
      .maybeSingle();

    if (taskError) return NextResponse.json({ error: taskError.message }, { status: 500 });
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const { data: deletedTask, error } = await mutationClient
      .from('review_points')
      .delete()
      .eq('id', taskId)
      .select('id')
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!deletedTask) {
      return NextResponse.json(
        { error: 'Task could not be deleted. Check review_points delete permissions.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
