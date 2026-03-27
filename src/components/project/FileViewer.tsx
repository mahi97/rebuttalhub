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

type ViewTab = 'pdf' | 'text' | 'source';

function initialView(file: ProjectFile): ViewTab {
  if (file.file_type === 'pdf') {
    // If text was already extracted, start on the text tab — otherwise show PDF
    return file.extracted_markdown != null ? 'text' : 'pdf';
  }
  return 'text';
}

export default function FileViewer({ file, onProcessed }: FileViewerProps) {
  const [view, setView] = useState<ViewTab>(() => initialView(file));
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // When switching back to this tab after a successful extraction the file prop
  // will already have extracted_markdown set — re-sync the view.
  useEffect(() => {
    setView(initialView(file));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id]); // only reset when the *file itself* changes, not on every prop update

  // Fetch a signed URL for the PDF so we can embed / download it
  useEffect(() => {
    if (!file.storage_path) return;
    const supabase = createClient();
    supabase.storage
      .from('project-files')
      .createSignedUrl(file.storage_path, 3600)
      .then(({ data }) => { if (data?.signedUrl) setPdfUrl(data.signedUrl); });
  }, [file.storage_path]);

  // After a successful re-process call we flip to the text view as soon as
  // the parent re-fetches and the file prop gains extracted_markdown.
  const [pendingTextSwitch, setPendingTextSwitch] = useState(false);
  useEffect(() => {
    if (pendingTextSwitch && file.extracted_markdown != null) {
      setView('text');
      setPendingTextSwitch(false);
    }
  }, [file.extracted_markdown, pendingTextSwitch]);

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
        const result = await res.json();
        if (result.charCount === 0) {
          toast.success('Processing done — no selectable text found (may be a scanned/image PDF)');
        } else {
          toast.success(`Extracted ${result.charCount.toLocaleString()} characters`);
        }
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
  const hasText = file.extracted_markdown != null; // null = not yet processed; '' = processed but empty
  const hasRawText = file.extracted_text != null && file.extracted_text.length > 0;

  return (
    <div className="h-full flex flex-col">
      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-3 border-b border-[var(--border)] flex-wrap">
        <FileText className="w-4 h-4 text-blue-400 shrink-0" />
        <span className="text-sm font-medium mr-2 truncate max-w-xs">{file.file_name}</span>

        {/* PDF tab — always visible for PDFs */}
        {isPdf && (
          <button
            onClick={() => setView('pdf')}
            className={`flex items-center gap-1 px-3 py-1 text-xs rounded-md transition-colors ${
              view === 'pdf' ? 'bg-blue-500/20 text-blue-400' : 'text-[var(--muted-foreground)] hover:text-white'
            }`}
          >
            <Eye className="w-3 h-3" />
            PDF View
          </button>
        )}

        {/* Extracted Text tab — always visible for PDFs, shown for other types when text exists */}
        {(isPdf || hasText || file.html_content) && (
          <button
            onClick={() => setView('text')}
            className={`flex items-center gap-1 px-3 py-1 text-xs rounded-md transition-colors ${
              view === 'text' ? 'bg-blue-500/20 text-blue-400' : 'text-[var(--muted-foreground)] hover:text-white'
            }`}
          >
            <Eye className="w-3 h-3" />
            Extracted Text
            {!hasText && isPdf && (
              <span className="ml-1 text-[10px] text-amber-400">(not extracted)</span>
            )}
          </button>
        )}

        {/* Raw source tab */}
        {(file.file_type === 'zip' || hasRawText) && (
          <button
            onClick={() => setView('source')}
            className={`flex items-center gap-1 px-3 py-1 text-xs rounded-md transition-colors ${
              view === 'source' ? 'bg-blue-500/20 text-blue-400' : 'text-[var(--muted-foreground)] hover:text-white'
            }`}
          >
            <Code className="w-3 h-3" />
            Source
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleReprocess}
            disabled={processing}
            title="Re-extract text from file"
            className="flex items-center gap-1 px-3 py-1 text-xs rounded-md text-[var(--muted-foreground)] hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${processing ? 'animate-spin' : ''}`} />
            {processing ? 'Extracting…' : hasText ? 'Re-extract' : 'Extract text'}
          </button>

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

      {/* ── Content area ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto min-h-0">

        {/* PDF embed */}
        {view === 'pdf' && isPdf && (
          pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-full border-0"
              title="Paper PDF"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-[var(--muted-foreground)]">
              <p>Loading PDF…</p>
            </div>
          )
        )}

        {/* Extracted text / markdown */}
        {view === 'text' && (
          hasText || file.html_content ? (
            <div className="p-4">
              {(file.extracted_markdown || file.html_content) ? (
                <MarkdownViewer
                  content={file.extracted_markdown || file.html_content || ''}
                  showToggle={false}
                />
              ) : (
                /* extracted_markdown === '' means we processed but found nothing */
                <div className="flex flex-col items-center justify-center h-full gap-3 py-20 text-[var(--muted-foreground)]">
                  <FileText className="w-10 h-10 opacity-40" />
                  <p className="text-sm">No selectable text found — this PDF may be image-based.</p>
                  <button
                    onClick={handleReprocess}
                    disabled={processing}
                    className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${processing ? 'animate-spin' : ''}`} />
                    {processing ? 'Extracting…' : 'Try again'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* null means never processed */
            <div className="flex flex-col items-center justify-center h-full gap-3 py-20 text-[var(--muted-foreground)]">
              <FileText className="w-10 h-10 opacity-40" />
              <p className="text-sm">Text has not been extracted yet.</p>
              <button
                onClick={handleReprocess}
                disabled={processing}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${processing ? 'animate-spin' : ''}`} />
                {processing ? 'Extracting…' : 'Extract text now'}
              </button>
            </div>
          )
        )}

        {/* Raw source */}
        {view === 'source' && hasRawText && (
          <SyntaxHighlighter
            language={file.file_type === 'zip' ? 'latex' : 'text'}
            style={oneDark}
            customStyle={{ background: 'transparent', padding: '1rem', margin: 0, fontSize: '0.875rem' }}
            showLineNumbers
          >
            {file.extracted_text!}
          </SyntaxHighlighter>
        )}
      </div>
    </div>
  );
}
