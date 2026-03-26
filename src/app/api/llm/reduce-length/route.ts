import { createClient } from '@/lib/supabase/server';
import { callClaude } from '@/lib/llm/anthropic';
import { REDUCE_LENGTH_SYSTEM, reduceLengthPrompt } from '@/lib/llm/prompts';
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

    const { rebuttalText, charLimit } = await request.json();

    const reduced = await callClaude(
      profile.anthropic_api_key,
      REDUCE_LENGTH_SYSTEM,
      reduceLengthPrompt(rebuttalText, charLimit),
      8192
    );

    return NextResponse.json({ rebuttal: reduced });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to reduce length' }, { status: 500 });
  }
}
