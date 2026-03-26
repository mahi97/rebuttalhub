import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

async function getAuthorizedProjectOwner(projectId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const mutationClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createServiceClient()
    : supabase;

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, name, owner_id, archived_at')
    .eq('id', projectId)
    .maybeSingle();

  if (projectError) {
    return { error: NextResponse.json({ error: projectError.message }, { status: 500 }) };
  }

  if (!project) {
    return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) };
  }

  if (project.owner_id !== user.id) {
    return { error: NextResponse.json({ error: 'Only the project owner can manage this project' }, { status: 403 }) };
  }

  return { supabase, mutationClient, user, project };
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: projectId } = params;
    const auth = await getAuthorizedProjectOwner(projectId);
    if (auth.error) return auth.error;

    const { mutationClient, user, project } = auth;
    const { action } = await request.json();

    if (action === 'archive') {
      if (project.archived_at) {
        return NextResponse.json({ error: 'Project is already archived' }, { status: 400 });
      }

      const { data: archivedProject, error } = await mutationClient
        .from('projects')
        .update({
          archived_at: new Date().toISOString(),
          archived_by: user.id,
          archived_reason: 'manual',
          archived_metadata: {},
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .eq('owner_id', user.id)
        .select('id')
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (!archivedProject) {
        return NextResponse.json({ error: 'Project could not be archived' }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: 'archive', projectId, projectName: project.name });
    }

    if (action === 'restore') {
      if (!project.archived_at) {
        return NextResponse.json({ error: 'Project is not archived' }, { status: 400 });
      }

      const { data: restoredProject, error } = await mutationClient
        .from('projects')
        .update({
          archived_at: null,
          archived_by: null,
          archived_reason: null,
          archived_metadata: {},
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .eq('owner_id', user.id)
        .select('id')
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (!restoredProject) {
        return NextResponse.json({ error: 'Project could not be restored' }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: 'restore', projectId, projectName: project.name });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update project archive state' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: projectId } = params;
    const auth = await getAuthorizedProjectOwner(projectId);
    if (auth.error) return auth.error;

    const { supabase, mutationClient, user, project } = auth;

    const { data: projectFiles, error: filesError } = await supabase
      .from('project_files')
      .select('storage_path')
      .eq('project_id', projectId);

    if (filesError) {
      return NextResponse.json({ error: filesError.message }, { status: 500 });
    }

    const storagePaths = (projectFiles || [])
      .map((file) => file.storage_path)
      .filter(Boolean);

    if (storagePaths.length > 0) {
      const { error: storageError } = await mutationClient.storage
        .from('project-files')
        .remove(storagePaths);

      if (storageError) {
        return NextResponse.json({ error: storageError.message }, { status: 500 });
      }
    }

    const { data: deletedProject, error: deleteError } = await mutationClient
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('owner_id', user.id)
      .select('id')
      .maybeSingle();

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    if (!deletedProject) {
      return NextResponse.json({ error: 'Project could not be deleted' }, { status: 500 });
    }

    return NextResponse.json({ success: true, projectId, projectName: project.name });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete project' }, { status: 500 });
  }
}
