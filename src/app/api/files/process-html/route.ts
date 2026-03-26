import { createClient } from '@/lib/supabase/server';
import { parseOpenReviewHTML, openReviewHtmlToMarkdown } from '@/lib/processing/html-parser';
import { callClaudeJSON } from '@/lib/llm/anthropic';
import { NextResponse } from 'next/server';

export const maxDuration = 60;

interface LLMParsedReview {
  strengths: string[];
  thank_you_draft: string;
  weaknesses: { label: string; summary: string; full_text: string }[];
  questions: { label: string; summary: string; full_text: string }[];
  limitations: { label: string; summary: string; full_text: string }[];
}

const PARSE_SYSTEM = `You are an expert at parsing academic peer reviews into structured tasks. You must return valid JSON only.`;

function buildParsePrompt(reviewerName: string, reviewText: string): string {
  return `Parse this review by ${reviewerName} into structured tasks.

Review text:
${reviewText.slice(0, 15000)}

Return JSON with this exact structure:
{
  "strengths": ["strength point 1", "strength point 2", ...],
  "thank_you_draft": "<a 2-4 sentence thank you note mentioning all the strengths they raised, genuine and specific, not sycophantic>",
  "weaknesses": [
    {"label": "W1", "summary": "<short 5-10 word description of the weakness>", "full_text": "<the full reviewer text for this weakness point>"},
    {"label": "W2", "summary": "...", "full_text": "..."}
  ],
  "questions": [
    {"label": "Q1", "summary": "<short description>", "full_text": "<full reviewer text>"}
  ],
  "limitations": [
    {"label": "L1", "summary": "<short description>", "full_text": "<full reviewer text>"}
  ]
}

Rules:
- Each individual weakness/question/limitation point becomes its own task. Do NOT merge multiple points.
- If the review has a combined "Strengths And Weaknesses" section, split them properly.
- Strengths go into the strengths array only.
- Number labels sequentially: W1, W2, W3 for weaknesses; Q1, Q2 for questions; L1, L2 for limitations.
- "summary" is a very short description (5-10 words) like "Missing baseline comparison" or "Unclear notation in Eq. 3"
- "full_text" is the reviewer's exact words for that point (preserve verbatim)
- The thank_you_draft should mention specific positive points the reviewer raised
- If a section doesn't exist, return an empty array for it
- Return ONLY valid JSON, no markdown code blocks`;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { fileId, projectId } = await request.json();

    // Check if user has API key for LLM parsing
    const { data: profile } = await supabase
      .from('profiles')
      .select('anthropic_api_key')
      .eq('id', user.id)
      .single();

    const { data: fileRecord } = await supabase
      .from('project_files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (!fileRecord) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const { data: fileData } = await supabase.storage
      .from('project-files')
      .download(fileRecord.storage_path);

    if (!fileData) {
      return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
    }

    const html = await fileData.text();

    // Step 1: DOM-parse to extract reviewer names, ratings, raw text
    const parsedReviews = parseOpenReviewHTML(html);
    const markdown = openReviewHtmlToMarkdown(html);

    await supabase
      .from('project_files')
      .update({
        html_content: html,
        extracted_markdown: markdown,
        metadata: { reviewCount: parsedReviews.length },
      })
      .eq('id', fileId);

    let totalPoints = 0;
    const hasApiKey = !!profile?.anthropic_api_key;

    for (let i = 0; i < parsedReviews.length; i++) {
      const r = parsedReviews[i];

      const { data: review } = await supabase
        .from('reviews')
        .insert({
          project_id: projectId,
          reviewer_name: r.reviewer,
          rating: r.rating,
          confidence: r.confidence,
          raw_text: r.rawText,
          sections: r.sections,
          sort_order: i,
        })
        .select()
        .single();

      if (!review) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pointsToInsert: any[] = [];

      if (hasApiKey) {
        // Step 2: Use LLM to properly divide into W/Q/L tasks
        try {
          const parsed = await callClaudeJSON<LLMParsedReview>(
            profile!.anthropic_api_key!,
            PARSE_SYSTEM,
            buildParsePrompt(r.reviewer, r.rawText)
          );

          // Thank You task
          pointsToInsert.push({
            review_id: review.id,
            project_id: projectId,
            section: 'Thank You',
            label: 'Thank You',
            point_text: (parsed.strengths || []).join('\n\n'),
            draft_response: parsed.thank_you_draft || '',
            priority: 'medium',
            status: 'not_started',
            sort_order: 0,
          });

          // Weakness tasks
          for (let j = 0; j < (parsed.weaknesses || []).length; j++) {
            const w = parsed.weaknesses[j];
            pointsToInsert.push({
              review_id: review.id,
              project_id: projectId,
              section: 'Weakness',
              label: w.label || `W${j + 1}`,
              point_text: w.full_text,
              draft_response: `> **${w.label || `W${j + 1}`}:** *${w.summary}*\n\n**Response ${w.label || `W${j + 1}`}:** `,
              priority: 'high',
              status: 'not_started',
              sort_order: j + 1,
            });
          }

          // Question tasks
          const wLen = (parsed.weaknesses || []).length;
          for (let j = 0; j < (parsed.questions || []).length; j++) {
            const q = parsed.questions[j];
            pointsToInsert.push({
              review_id: review.id,
              project_id: projectId,
              section: 'Question',
              label: q.label || `Q${j + 1}`,
              point_text: q.full_text,
              draft_response: `> **${q.label || `Q${j + 1}`}:** *${q.summary}*\n\n**Response ${q.label || `Q${j + 1}`}:** `,
              priority: 'medium',
              status: 'not_started',
              sort_order: wLen + j + 1,
            });
          }

          // Limitation tasks
          const qLen = (parsed.questions || []).length;
          for (let j = 0; j < (parsed.limitations || []).length; j++) {
            const l = parsed.limitations[j];
            pointsToInsert.push({
              review_id: review.id,
              project_id: projectId,
              section: 'Limitation',
              label: l.label || `L${j + 1}`,
              point_text: l.full_text,
              draft_response: `> **${l.label || `L${j + 1}`}:** *${l.summary}*\n\n**Response ${l.label || `L${j + 1}`}:** `,
              priority: 'medium',
              status: 'not_started',
              sort_order: wLen + qLen + j + 1,
            });
          }
        } catch {
          // LLM failed, fall back to DOM-parsed points
          fallbackInsert(pointsToInsert, review.id, projectId, r);
        }
      } else {
        // No API key, use DOM-parsed points
        fallbackInsert(pointsToInsert, review.id, projectId, r);
      }

      if (pointsToInsert.length > 0) {
        await supabase.from('review_points').insert(pointsToInsert);
        totalPoints += pointsToInsert.length;
      }
    }

    return NextResponse.json({
      success: true,
      reviewCount: parsedReviews.length,
      pointCount: totalPoints,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Processing failed' }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fallbackInsert(pointsToInsert: any[], reviewId: string, projectId: string, r: any) {
  if (r.strengths && r.strengths.length > 0) {
    pointsToInsert.push({
      review_id: reviewId,
      project_id: projectId,
      section: 'Thank You',
      label: 'Thank You',
      point_text: r.strengths.join('\n\n'),
      priority: 'medium',
      status: 'not_started',
      sort_order: 0,
    });
  }

  for (let j = 0; j < r.points.length; j++) {
    const p = r.points[j];
    pointsToInsert.push({
      review_id: reviewId,
      project_id: projectId,
      section: p.section,
      label: p.label,
      point_text: p.text,
      draft_response: `> **${p.label}:** *${p.text.slice(0, 80)}...*\n\n**Response ${p.label}:** `,
      priority: p.priority,
      status: 'not_started',
      sort_order: j + 1,
    });
  }
}
