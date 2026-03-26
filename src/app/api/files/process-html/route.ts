import { createClient } from '@/lib/supabase/server';
import { parseOpenReviewHTML, openReviewHtmlToMarkdown } from '@/lib/processing/html-parser';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { fileId, projectId } = await request.json();

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

      const pointsToInsert: any[] = [];

      // Create "Thank You" task from strengths (always first, sort_order 0)
      if (r.strengths.length > 0) {
        pointsToInsert.push({
          review_id: review.id,
          project_id: projectId,
          section: 'Thank You',
          label: 'Thank You',
          point_text: r.strengths.join('\n\n'),
          priority: 'medium',
          status: 'not_started',
          sort_order: 0,
        });
      }

      // Create W/Q/L tasks
      for (let j = 0; j < r.points.length; j++) {
        const p = r.points[j];
        pointsToInsert.push({
          review_id: review.id,
          project_id: projectId,
          section: p.section,
          label: p.label,
          point_text: p.text,
          priority: p.priority,
          status: 'not_started',
          sort_order: j + 1, // after thank you note
        });
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
