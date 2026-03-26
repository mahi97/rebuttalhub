import { createClient } from '@/lib/supabase/server';
import { callClaude } from '@/lib/llm/anthropic';
import {
  DRAFT_RESPONSE_SYSTEM,
  draftResponsePrompt,
  IMPROVE_DRAFT_SYSTEM,
  improveDraftPrompt,
} from '@/lib/llm/prompts';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('anthropic_api_key')
      .eq('id', user.id)
      .single();

    if (!profile?.anthropic_api_key) {
      return NextResponse.json({ error: 'Please set your Anthropic API key in Settings' }, { status: 400 });
    }

    const { pointId, pointText, sectionName, paperContext, currentDraft, mode } = await request.json();

    let draft: string;

    if (mode === 'improve' && currentDraft) {
      draft = await callClaude(
        profile.anthropic_api_key,
        IMPROVE_DRAFT_SYSTEM,
        improveDraftPrompt(pointText, currentDraft)
      );
    } else {
      draft = await callClaude(
        profile.anthropic_api_key,
        DRAFT_RESPONSE_SYSTEM,
        draftResponsePrompt(paperContext || '', sectionName, pointText)
      );
    }

    // Save draft to database
    if (pointId) {
      await supabase
        .from('review_points')
        .update({ draft_response: draft, updated_at: new Date().toISOString() })
        .eq('id', pointId);
    }

    return NextResponse.json({ draft });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to draft response' }, { status: 500 });
  }
}
