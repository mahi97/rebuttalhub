import { createClient } from '@/lib/supabase/server';
import { callClaude } from '@/lib/llm/anthropic';
import { SUMMARIZE_SYSTEM, summarizePrompt } from '@/lib/llm/prompts';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
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

    const { reviewId, reviewText } = await request.json();

    const summary = await callClaude(
      profile.anthropic_api_key,
      SUMMARIZE_SYSTEM,
      summarizePrompt(reviewText)
    );

    if (reviewId) {
      await supabase
        .from('reviews')
        .update({ summary })
        .eq('id', reviewId);
    }

    return NextResponse.json({ summary });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to summarize' }, { status: 500 });
  }
}
