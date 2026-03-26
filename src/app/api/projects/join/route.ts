import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { inviteCode } = await request.json();

    if (!inviteCode?.trim()) {
      return NextResponse.json({ error: 'Invite code is required' }, { status: 400 });
    }

    // Find project by invite code
    const { data: project } = await supabase
      .from('projects')
      .select('id, name')
      .eq('invite_code', inviteCode.trim())
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 });
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .single();

    if (existing) {
      return NextResponse.json({ project, alreadyMember: true });
    }

    // Add as member
    await supabase.from('project_members').insert({
      project_id: project.id,
      user_id: user.id,
      role: 'member',
    });

    return NextResponse.json({ project });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to join project' }, { status: 500 });
  }
}
