import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const projectId = formData.get('projectId') as string;
    const fileType = formData.get('fileType') as string;

    if (!file || !projectId || !fileType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Size limits
    const maxSizes: Record<string, number> = {
      pdf: 50 * 1024 * 1024,
      zip: 20 * 1024 * 1024,
      html: 5 * 1024 * 1024,
    };
    if (file.size > (maxSizes[fileType] || 10 * 1024 * 1024)) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 });
    }

    // Determine storage path
    const subfolders: Record<string, string> = {
      pdf: 'papers',
      html: 'openreview',
      zip: 'latex',
    };
    const storagePath = `${projectId}/${subfolders[fileType] || 'other'}/${file.name}`;

    // Upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from('project-files')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Create file record
    const { data: fileRecord, error: dbError } = await supabase
      .from('project_files')
      .insert({
        project_id: projectId,
        file_name: file.name,
        file_type: fileType,
        storage_path: storagePath,
        file_size: file.size,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ file: fileRecord });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  }
}
