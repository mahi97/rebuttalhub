import { createClient } from '@/lib/supabase/server';
import { processLatexZip } from '@/lib/processing/latex-processor';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { fileId } = await request.json();

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

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const { files, mainTex, markdown, fileTree } = await processLatexZip(buffer);

    await supabase
      .from('project_files')
      .update({
        extracted_text: mainTex,
        extracted_markdown: markdown,
        metadata: {
          fileCount: files.length,
          fileTree,
          texFiles: files.map((f) => ({ name: f.name, isMain: f.isMain })),
        },
      })
      .eq('id', fileId);

    return NextResponse.json({
      success: true,
      fileCount: files.length,
      files: files.map((f) => ({ name: f.name, isMain: f.isMain })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'LaTeX processing failed' }, { status: 500 });
  }
}
