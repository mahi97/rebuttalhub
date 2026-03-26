import { createClient } from '@/lib/supabase/server';
import { callClaude } from '@/lib/llm/anthropic';
import {
  DRAFT_RESPONSE_SYSTEM,
  draftResponsePrompt,
  IMPROVE_DRAFT_SYSTEM,
  improveDraftPrompt,
  DRAFT_THANK_YOU_SYSTEM,
  draftThankYouPrompt,
  REDUCE_LENGTH_SYSTEM,
} from '@/lib/llm/prompts';
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

    const { pointId, pointText, sectionName, label, paperContext, currentDraft, mode, projectId, reviewerName } = await request.json();

    // Fetch project template, guidelines, and full context
    let template = '';
    let guidelines = '';
    let fullContext = paperContext || '';

    if (projectId) {
      const { data: project } = await supabase
        .from('projects')
        .select('rebuttal_template, guidelines')
        .eq('id', projectId)
        .single();
      template = project?.rebuttal_template || '';
      guidelines = project?.guidelines || '';

      // Build full context: paper text + latex + all reviews + existing responses
      const { data: files } = await supabase
        .from('project_files')
        .select('extracted_text, extracted_markdown, file_type')
        .eq('project_id', projectId);

      if (files) {
        const pdfFile = files.find((f) => f.file_type === 'pdf');
        const texFile = files.find((f) => f.file_type === 'zip');

        // Include paper context (prefer markdown, fallback to text)
        const paperMd = pdfFile?.extracted_markdown || pdfFile?.extracted_text || '';
        const texMd = texFile?.extracted_markdown || texFile?.extracted_text || '';
        fullContext = `[PAPER]\n${paperMd.slice(0, 6000)}\n\n[LATEX]\n${texMd.slice(0, 4000)}`;
      }

      // Include other reviews and existing answers for cross-reference
      const { data: allPoints } = await supabase
        .from('review_points')
        .select('label, section, point_text, draft_response, review:reviews(reviewer_name)')
        .eq('project_id', projectId)
        .is('deleted_at', null)
        .not('draft_response', 'is', null);

      if (allPoints && allPoints.length > 0) {
        const otherAnswers = allPoints
          .filter((p) => p.draft_response)
          .map((p: any) => `[${p.review?.reviewer_name} - ${p.label}] Q: ${p.point_text.slice(0, 100)}... A: ${p.draft_response.slice(0, 200)}...`)
          .join('\n');
        if (otherAnswers) {
          fullContext += `\n\n[EXISTING RESPONSES]\n${otherAnswers.slice(0, 3000)}`;
        }
      }
    }

    let draft: string;

    if (sectionName === 'Thank You') {
      draft = await callClaude(
        profile.anthropic_api_key,
        DRAFT_THANK_YOU_SYSTEM,
        draftThankYouPrompt(reviewerName || 'the reviewer', pointText, guidelines)
      );
    } else if (mode === 'shorten' && currentDraft) {
      draft = await callClaude(
        profile.anthropic_api_key,
        REDUCE_LENGTH_SYSTEM,
        `Shorten this rebuttal response while preserving all key arguments.\n\nOriginal reviewer comment: "${pointText}"\n\nCurrent response:\n${currentDraft}\n\nMake it 30-50% shorter. Keep evidence and specific references. Remove filler.`
      );
    } else if (mode === 'improve' && currentDraft) {
      draft = await callClaude(
        profile.anthropic_api_key,
        IMPROVE_DRAFT_SYSTEM,
        improveDraftPrompt(pointText, currentDraft, guidelines)
      );
    } else {
      draft = await callClaude(
        profile.anthropic_api_key,
        DRAFT_RESPONSE_SYSTEM,
        draftResponsePrompt(fullContext, sectionName, label || '', pointText, template, guidelines)
      );
    }

    if (pointId) {
      await supabase
        .from('review_points')
        .update({ draft_response: draft, updated_at: new Date().toISOString() })
        .eq('id', pointId)
        .is('deleted_at', null);
    }

    return NextResponse.json({ draft });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to draft response' }, { status: 500 });
  }
}
