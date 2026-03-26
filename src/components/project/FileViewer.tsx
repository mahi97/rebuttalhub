'use client';

import { useState } from 'react';
import MarkdownViewer from '@/components/ui/MarkdownViewer';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { FileText, Code, Eye } from 'lucide-react';
import type { ProjectFile } from '@/types';

interface FileViewerProps {
  file: ProjectFile;
}

export default function FileViewer({ file }: FileViewerProps) {
  const [view, setView] = useState<'markdown' | 'source'>('markdown');

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 p-3 border-b border-[var(--border)]">
        <FileText className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-medium">{file.file_name}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setView('markdown')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              view === 'markdown' ? 'bg-blue-500/20 text-blue-400' : 'text-[var(--muted-foreground)] hover:text-white'
            }`}
          >
            <Eye className="w-3 h-3 inline mr-1" />
            Preview
          </button>
          {(file.file_type === 'zip' || file.extracted_text) && (
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
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {view === 'markdown' && file.extracted_markdown ? (
          <MarkdownViewer content={file.extracted_markdown} showToggle={false} />
        ) : view === 'source' && file.extracted_text ? (
          <SyntaxHighlighter
            language={file.file_type === 'zip' ? 'latex' : 'text'}
            style={oneDark}
            customStyle={{
              background: 'transparent',
              padding: 0,
              margin: 0,
              fontSize: '0.875rem',
            }}
            showLineNumbers
          >
            {file.extracted_text}
          </SyntaxHighlighter>
        ) : file.html_content ? (
          <MarkdownViewer
            content={file.extracted_markdown || 'Processing...'}
            showToggle={false}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--muted-foreground)]">
            <p>No preview available. File may still be processing.</p>
          </div>
        )}
      </div>
    </div>
  );
}
