'use client';

import { useState, useEffect } from 'react';
import MarkdownViewer from '@/components/ui/MarkdownViewer';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { FileText, Code, Eye, RefreshCw, Download } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import type { ProjectFile } from '@/types';

interface FileViewerProps {
  file: ProjectFile;
  onProcessed?: () => void;
}

type ViewTab = 'embed' | 'text' | 'source';

function defaultView(file: ProjectFile): ViewTab {
  if (file.file_type === 'pdf') return 'embed';
  if (file.extracted_markdown != null) return 'text';
  return 'source';
}

export default function FileViewer({ file, onProcessed }: FileViewerProps) {
  const [view, setView] = useState<ViewTab>(() => defaultView(file));
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // Re-sync view when switching tabs in the documents page (file.id changes)
  useEffect(() => { setView(defaultView(file)); }, [file.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flip to text view once extraction lands after a re-process
  const [pendingTextSwitch, setPendingTextSwitch] = useState(false);
  useEffect(() => {
    if (pendingTextSwitch && file.extracted_markdown != null) {
      setView('text');
      setPendingTextSwitch(false);
    }
  }, [file.extracted_markdown, pendingTextSwitch]);

  // Signed URL for PDF embed / download
  useEffect(() => {
    if (!file.storage_path) return;
    const supabase = createClient();
    supabase.storage
      .from('project-files')
      .createSignedUrl(file.storage_path, 3600)
      .then(({ data }) => { if (data?.signedUrl) setEmbedUrl(data.signedUrl); });
  }, [file.storage_path]);

  const handleReprocess = async () => {
    setProcessing(true);
    try {
      const endpoint =
        file.file_type === 'pdf' ? '/api/files/process-pdf' :
        file.file_type === 'zip' ? '/api/files/process-latex' :
        '/api/files/process-html';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: file.id, projectId: file.project_id }),
      });

      if (res.ok) {
        const result = await res.json();
        toast.success(`Processed — ${(result.charCount ?? 0).toLocaleString()} characters extracted`);
        setPendingTextSwitch(true);
        onProcessed?.();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Processing failed');
      }
    } catch {
      toast.error('Processing failed');
    } finally {
      setProcessing(false);
    }
  };

  const isPdf = file.file_type === 'pdf';
  const hasMarkdown = file.extracted_markdown != null && file.extracted_markdown.length > 0;
  const hasRawText = (file.extracted_text?.length ?? 0) > 0;

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 p-3 border-b border-[var(--border)] flex-wrap">
        <FileText className="w-4 h-4 text-blue-400 shrink-0" />
        <span className="text-sm font-medium mr-2 truncate max-w-xs">{file.file_name}</span>

        {isPdf && (
          <button
            onClick={() => setView('embed')}
            className={`flex items-center gap-1 px-3 py-1 text-xs rounded-md transition-colors ${view === 'embed' ? 'bg-blue-500/20 text-blue-400' : 'text-[var(--muted-foreground)] hover:text-white'}`}
          >
            <Eye className="w-3 h-3" />
            PDF View
          </button>
        )}

        {(hasMarkdown || file.html_content) && (
          <button
            onClick={() => setView('text')}
            className={`flex items-center gap-1 px-3 py-1 text-xs rounded-md transition-colors ${view === 'text' ? 'bg-blue-500/20 text-blue-400' : 'text-[var(--muted-foreground)] hover:text-white'}`}
          >
            <Eye className="w-3 h-3" />
            {isPdf ? 'Extracted Text' : 'Rendered Markdown'}
          </button>
        )}

        {(file.file_type === 'zip' || hasRawText) && (
          <button
            onClick={() => setView('source')}
            className={`flex items-center gap-1 px-3 py-1 text-xs rounded-md transition-colors ${view === 'source' ? 'bg-blue-500/20 text-blue-400' : 'text-[var(--muted-foreground)] hover:text-white'}`}
          >
            <Code className="w-3 h-3" />
            LaTeX Source
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Only show re-process for non-PDF files */}
          {!isPdf && (
            <button
              onClick={handleReprocess}
              disabled={processing}
              title="Re-process to extract content"
              className="flex items-center gap-1 px-3 py-1 text-xs rounded-md text-[var(--muted-foreground)] hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${processing ? 'animate-spin' : ''}`} />
              {processing ? 'Processing…' : hasMarkdown ? 'Re-process' : 'Process'}
            </button>
          )}

          {embedUrl && (
            <a
              href={embedUrl}
              download={file.file_name}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1 text-xs rounded-md text-[var(--muted-foreground)] hover:text-white hover:bg-white/5 transition-colors"
            >
              <Download className="w-3 h-3" />
              Download
            </a>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto min-h-0">

        {/* PDF embed — full height iframe, no extraction nonsense */}
        {view === 'embed' && isPdf && (
          embedUrl ? (
            <iframe src={embedUrl} className="w-full h-full border-0" title="Paper PDF" />
          ) : (
            <div className="flex items-center justify-center h-full text-[var(--muted-foreground)]">
              <p>Loading PDF…</p>
            </div>
          )
        )}

        {/* Rendered markdown */}
        {view === 'text' && (
          <div className="p-4">
            <MarkdownViewer
              content={file.extracted_markdown || file.html_content || ''}
              showToggle={false}
            />
          </div>
        )}

        {/* Raw LaTeX / plain text source */}
        {view === 'source' && (
          hasRawText ? (
            <SyntaxHighlighter
              language={file.file_type === 'zip' ? 'latex' : 'text'}
              style={oneDark}
              customStyle={{ background: 'transparent', padding: '1rem', margin: 0, fontSize: '0.875rem' }}
              showLineNumbers
            >
              {file.extracted_text!}
            </SyntaxHighlighter>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-20 text-[var(--muted-foreground)]">
              <FileText className="w-10 h-10 opacity-40" />
              <p className="text-sm">Not processed yet.</p>
              <button
                onClick={handleReprocess}
                disabled={processing}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${processing ? 'animate-spin' : ''}`} />
                {processing ? 'Processing…' : 'Process now'}
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
