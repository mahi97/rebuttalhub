import { createClient } from '@/lib/supabase/server';
import { parseOpenReviewHTML, openReviewHtmlToMarkdown } from '@/lib/processing/html-parser';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { fileId, projectId } = await request.json();

    // Get the file record
    const { data: fileRecord } = await supabase
      .from('project_files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (!fileRecord) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Download file from storage
    const { data: fileData } = await supabase.storage
      .from('project-files')
      .download(fileRecord.storage_path);

    if (!fileData) {
      return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
    }

    const html = await fileData.text();

    // Parse reviews from HTML
    const parsedReviews = parseOpenReviewHTML(html);

    // Convert to markdown
    const markdown = openReviewHtmlToMarkdown(html);

    // Update file record with processed content
    await supabase
      .from('project_files')
      .update({
        html_content: html,
        extracted_markdown: markdown,
        metadata: { reviewCount: parsedReviews.length },
      })
      .eq('id', fileId);

    // Insert reviews into database
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

      if (review && r.points.length > 0) {
        const points = r.points.map((p, j) => ({
          review_id: review.id,
          project_id: projectId,
          section: p.section,
          point_text: p.text,
          priority: p.priority,
          status: 'not_started' as const,
          sort_order: j,
        }));

        await supabase.from('review_points').insert(points);
      }
    }

    return NextResponse.json({
      success: true,
      reviewCount: parsedReviews.length,
      pointCount: parsedReviews.reduce((sum, r) => sum + r.points.length, 0),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Processing failed' }, { status: 500 });
  }
}
