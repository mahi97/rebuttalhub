import { createClient, createServiceClient } from '@/lib/supabase/server';
import { processPDF } from '@/lib/processing/pdf-extractor';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    // Authenticate the user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { fileId } = await request.json();

    // Read the file record with the user client (RLS-checked read)
    const { data: fileRecord, error: fetchError } = await supabase
      .from('project_files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fetchError || !fileRecord) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Download from storage
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
    const { text, markdown, pageCount } = await processPDF(buffer);

    // Use the service client to bypass RLS for the write — this is a
    // server-only route so it's safe; anon client updates were silently
    // failing when RLS update policies were not configured.
    const serviceSupabase = createServiceClient();
    const { error: updateError } = await serviceSupabase
      .from('project_files')
      .update({
        extracted_text: text || null,
        extracted_markdown: markdown || null,
        metadata: { ...(fileRecord.metadata || {}), pageCount },
      })
      .eq('id', fileId);

    if (updateError) {
      return NextResponse.json(
        { error: `Extraction succeeded but could not save: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, pageCount, charCount: text?.length ?? 0 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'PDF processing failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
