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

type ViewTab = 'pdf' | 'markdown' | 'source';

export default function FileViewer({ file, onProcessed }: FileViewerProps) {
  const [view, setView] = useState<ViewTab>(() => {
    if (file.file_type === 'pdf') return 'pdf';
    return 'markdown';
  });
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [justProcessed, setJustProcessed] = useState(false);

  // Auto-switch to extracted text once it becomes available after re-processing
  useEffect(() => {
    if (justProcessed && file.extracted_markdown) {
      setView('markdown');
      setJustProcessed(false);
    }
  }, [file.extracted_markdown, justProcessed]);

  useEffect(() => {
    if (file.storage_path) {
      const supabase = createClient();
      supabase.storage
        .from('project-files')
        .createSignedUrl(file.storage_path, 3600)
        .then(({ data }) => {
          if (data?.signedUrl) setPdfUrl(data.signedUrl);
        });
    }
  }, [file.storage_path]);

  const handleReprocess = async () => {
    setProcessing(true);
    try {
      const endpoint =
        file.file_type === 'pdf'
          ? '/api/files/process-pdf'
          : file.file_type === 'zip'
            ? '/api/files/process-latex'
            : '/api/files/process-html';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: file.id, projectId: file.project_id }),
      });

      if (res.ok) {
        toast.success('File processed successfully');
        setJustProcessed(true);
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
  const hasMarkdown = !!file.extracted_markdown;
  const hasText = !!file.extracted_text;

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 p-3 border-b border-[var(--border)] flex-wrap">
        <FileText className="w-4 h-4 text-blue-400 shrink-0" />
        <span className="text-sm font-medium mr-2">{file.file_name}</span>

        {isPdf && (
          <button
            onClick={() => setView('pdf')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              view === 'pdf' ? 'bg-blue-500/20 text-blue-400' : 'text-[var(--muted-foreground)] hover:text-white'
            }`}
          >
            <Eye className="w-3 h-3 inline mr-1" />
            PDF View
          </button>
        )}

        {(hasMarkdown || file.html_content) && (
          <button
            onClick={() => setView('markdown')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              view === 'markdown' ? 'bg-blue-500/20 text-blue-400' : 'text-[var(--muted-foreground)] hover:text-white'
            }`}
          >
            <Eye className="w-3 h-3 inline mr-1" />
            Extracted Text
          </button>
        )}

        {(file.file_type === 'zip' || hasText) && (
          <button
            onClick={() => setView('source')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              view === 'source' ? 'bg-blue-500/20 text-blue-400' : 'text-[var(--muted-foreground)] hover:text-white'
            }`}
          >
            <Code className="w-3 h-3 inline mr-1" />
            Source
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Retry processing button */}
          <button
            onClick={handleReprocess}
            disabled={processing}
            title="Re-process file to extract text"
            className="flex items-center gap-1 px-3 py-1 text-xs rounded-md text-[var(--muted-foreground)] hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${processing ? 'animate-spin' : ''}`} />
            {processing ? 'Processing…' : 'Re-process'}
          </button>

          {/* Download link */}
          {pdfUrl && (
            <a
              href={pdfUrl}
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
      <div className="flex-1 overflow-auto">
        {view === 'pdf' && isPdf ? (
          pdfUrl ? (
            <div className="h-full flex flex-col">
              <embed
                src={pdfUrl}
                type="application/pdf"
                className="w-full flex-1 min-h-0"
                style={{ height: '100%' }}
              />
              {!hasMarkdown && (
                <div className="p-3 border-t border-[var(--border)] bg-amber-500/10 text-amber-400 text-sm flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 shrink-0" />
                  Text extraction not available.
                  <button
                    onClick={handleReprocess}
                    disabled={processing}
                    className="underline hover:no-underline disabled:opacity-50"
                  >
                    {processing ? 'Processing…' : 'Extract text now'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-[var(--muted-foreground)]">
              <p>Loading PDF…</p>
            </div>
          )
        ) : view === 'markdown' && (hasMarkdown || file.html_content) ? (
          <div className="p-4">
            <MarkdownViewer
              content={file.extracted_markdown || file.html_content || ''}
              showToggle={false}
            />
          </div>
        ) : view === 'source' && hasText ? (
          <SyntaxHighlighter
            language={file.file_type === 'zip' ? 'latex' : 'text'}
            style={oneDark}
            customStyle={{
              background: 'transparent',
              padding: '1rem',
              margin: 0,
              fontSize: '0.875rem',
              height: '100%',
            }}
            showLineNumbers
          >
            {file.extracted_text!}
          </SyntaxHighlighter>
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--muted-foreground)]">
            <div className="text-center space-y-3">
              <FileText className="w-10 h-10 mx-auto opacity-40" />
              <p>No extracted content available.</p>
              <button
                onClick={handleReprocess}
                disabled={processing}
                className="flex items-center gap-2 mx-auto px-4 py-2 text-sm rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${processing ? 'animate-spin' : ''}`} />
                {processing ? 'Processing…' : 'Extract text from file'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
