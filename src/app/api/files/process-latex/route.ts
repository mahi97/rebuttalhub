import { createClient, createServiceClient } from '@/lib/supabase/server';
import { processLatexZip } from '@/lib/processing/latex-processor';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { fileId } = await request.json();

    const { data: fileRecord, error: fetchError } = await supabase
      .from('project_files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fetchError || !fileRecord) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const { data: fileData, error: storageError } = await supabase.storage
      .from('project-files')
      .download(fileRecord.storage_path);

    if (storageError || !fileData) {
      return NextResponse.json(
        { error: storageError?.message || 'Failed to download file' },
        { status: 500 }
      );
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const { files, mainTex, markdown, fileTree } = await processLatexZip(buffer);

    // Use service client to bypass RLS for the write
    const serviceSupabase = createServiceClient();
    const { error: updateError } = await serviceSupabase
      .from('project_files')
      .update({
        extracted_text: mainTex || null,
        extracted_markdown: markdown || null,
        metadata: {
          ...(fileRecord.metadata || {}),
          fileCount: files.length,
          fileTree,
          texFiles: files.map((f) => ({ name: f.name, isMain: f.isMain })),
        },
      })
      .eq('id', fileId);

    if (updateError) {
      return NextResponse.json(
        { error: `Processing succeeded but could not save: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      fileCount: files.length,
      charCount: markdown?.length ?? 0,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'LaTeX processing failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
