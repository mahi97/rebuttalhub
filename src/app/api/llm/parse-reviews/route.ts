import { createClient } from '@/lib/supabase/server';
import { callClaudeJSON } from '@/lib/llm/anthropic';
import { PARSE_REVIEWS_SYSTEM, parseReviewsPrompt } from '@/lib/llm/prompts';
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

    const { htmlText, projectId } = await request.json();

    const reviews = await callClaudeJSON<
      { reviewer: string; rating: string; confidence: string; points: { section: string; text: string; priority: string }[] }[]
    >(profile.anthropic_api_key, PARSE_REVIEWS_SYSTEM, parseReviewsPrompt(htmlText));

    // Insert reviews into database
    for (let i = 0; i < reviews.length; i++) {
      const r = reviews[i];
      const { data: review } = await supabase
        .from('reviews')
        .insert({
          project_id: projectId,
          reviewer_name: r.reviewer,
          rating: r.rating,
          confidence: r.confidence,
          raw_text: r.points.map((p) => `[${p.section}] ${p.text}`).join('\n\n'),
          sections: {},
          sort_order: i,
        })
        .select()
        .single();

      if (review) {
        const points = r.points.map((p, j) => ({
          review_id: review.id,
          project_id: projectId,
          section: p.section,
          point_text: p.text,
          priority: p.priority,
          status: 'not_started',
          sort_order: j,
        }));

        await supabase.from('review_points').insert(points);
      }
    }

    return NextResponse.json({ success: true, count: reviews.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to parse reviews' }, { status: 500 });
  }
}
