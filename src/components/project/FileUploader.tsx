'use client';

import { useState, useRef } from 'react';
import { FileText, FileCode, Globe, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

interface FileUploaderProps {
  projectId: string;
  onUploadComplete: () => void;
}

const fileTypes = [
  { type: 'pdf', label: 'Paper (PDF)', accept: '.pdf', icon: FileText, processEndpoint: '/api/files/process-pdf' },
  { type: 'html', label: 'OpenReview (HTML)', accept: '.html,.htm', icon: Globe, processEndpoint: '/api/files/process-html' },
  { type: 'zip', label: 'LaTeX Source (ZIP)', accept: '.zip', icon: FileCode, processEndpoint: '/api/files/process-latex' },
];

const subfolders: Record<string, string> = {
  pdf: 'papers',
  html: 'openreview',
  zip: 'latex',
};

export default function FileUploader({ projectId, onUploadComplete }: FileUploaderProps) {
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleUpload = async (fileType: string, processEndpoint: string, file: File) => {
    setUploading(fileType);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Upload directly to Supabase Storage (bypasses Vercel 4.5MB body limit)
      const storagePath = `${projectId}/${subfolders[fileType] || 'other'}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: true,
        });

      if (uploadError) throw new Error(uploadError.message);

      // Create file record in database
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

      if (dbError) throw new Error(dbError.message);

      toast.success(`${file.name} uploaded successfully`);

      // Process file via API route (the file is already in storage, so no body size issue)
      toast.loading('Processing file...', { id: 'processing' });
      const processRes = await fetch(processEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: fileRecord.id, projectId }),
      });

      toast.dismiss('processing');

      if (processRes.ok) {
        const result = await processRes.json();
        if (result.reviewCount !== undefined) {
          toast.success(`Found ${result.reviewCount} reviews with ${result.pointCount} points`);
        } else if (result.pageCount !== undefined) {
          toast.success(`Processed ${result.pageCount} pages`);
        } else if (result.fileCount !== undefined) {
          toast.success(`Extracted ${result.fileCount} files from ZIP`);
        } else {
          toast.success('File processed successfully');
        }
      } else {
        const err = await processRes.json().catch(() => ({}));
        toast.error(err.error || 'File uploaded but processing failed. You can retry later.');
      }

      onUploadComplete();
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {fileTypes.map(({ type, label, accept, icon: Icon, processEndpoint }) => (
        <div key={type}>
          <input
            ref={(el) => { fileRefs.current[type] = el; }}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(type, processEndpoint, file);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileRefs.current[type]?.click()}
            disabled={uploading !== null}
            className="w-full flex items-center gap-3 p-4 rounded-lg border border-dashed border-[var(--border)] hover:border-blue-500/50 hover:bg-blue-500/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading === type ? (
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            ) : (
              <Icon className="w-5 h-5 text-blue-400" />
            )}
            <div className="text-left">
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-[var(--muted-foreground)]">{accept}</p>
            </div>
          </button>
        </div>
      ))}
    </div>
  );
}
