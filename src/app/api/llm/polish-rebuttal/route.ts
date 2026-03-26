import { createClient } from '@/lib/supabase/server';
import { callClaude } from '@/lib/llm/anthropic';
import { POLISH_REBUTTAL_SYSTEM, polishRebuttalPrompt } from '@/lib/llm/prompts';
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

    const {
      scope,
      reviewerName,
      label,
      pointText,
      currentText,
      template,
      guidelines,
      charLimit,
      changeTypes,
      feedback,
      previousAttempt,
    } = await request.json();

    if (!scope || typeof currentText !== 'string' || !currentText.trim()) {
      return NextResponse.json({ error: 'scope and currentText are required' }, { status: 400 });
    }

    if (!['all_reviewers', 'reviewer', 'response'].includes(scope)) {
      return NextResponse.json({ error: 'Invalid polish scope' }, { status: 400 });
    }

    const proposal = await callClaude(
      profile.anthropic_api_key,
      POLISH_REBUTTAL_SYSTEM,
      polishRebuttalPrompt({
        scope,
        reviewerName,
        label,
        pointText,
        currentText,
        template,
        guidelines,
        charLimit,
        changeTypes,
        feedback,
        previousAttempt,
      }),
      8192
    );

    return NextResponse.json({ proposal: proposal.trim() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to polish rebuttal' }, { status: 500 });
  }
}
