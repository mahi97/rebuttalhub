import { createClient } from '@/lib/supabase/server';
import { callClaude } from '@/lib/llm/anthropic';
import { COMPILE_REBUTTAL_SYSTEM, compileRebuttalPrompt } from '@/lib/llm/prompts';
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

    const { reviewerName, thankYouNote, responses, template, guidelines, charLimit } = await request.json();

    const rebuttal = await callClaude(
      profile.anthropic_api_key,
      COMPILE_REBUTTAL_SYSTEM,
      compileRebuttalPrompt(
        reviewerName,
        thankYouNote || '',
        responses,
        template || '',
        guidelines || '',
        charLimit || 5000
      ),
      8192
    );

    return NextResponse.json({ rebuttal });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to compile rebuttal' }, { status: 500 });
  }
}
