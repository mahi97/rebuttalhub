'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Eye, Code } from 'lucide-react';

interface MarkdownViewerProps {
  content: string;
  className?: string;
  defaultView?: 'rendered' | 'raw';
  showToggle?: boolean;
}

export default function MarkdownViewer({
  content,
  className = '',
  defaultView = 'rendered',
  showToggle = true,
}: MarkdownViewerProps) {
  const [view, setView] = useState<'rendered' | 'raw'>(defaultView);

  if (!content) return null;

  return (
    <div className={className}>
      {showToggle && (
        <div className="flex items-center gap-1 mb-2">
          <button
            onClick={() => setView('rendered')}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${
              view === 'rendered'
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-[var(--muted-foreground)] hover:text-white'
            }`}
          >
            <Eye className="w-3 h-3" />
            Rendered
          </button>
          <button
            onClick={() => setView('raw')}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${
              view === 'raw'
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-[var(--muted-foreground)] hover:text-white'
            }`}
          >
            <Code className="w-3 h-3" />
            Raw
          </button>
        </div>
      )}

      {view === 'rendered' ? (
        <div className="markdown-content">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {content}
          </ReactMarkdown>
        </div>
      ) : (
        <pre className="text-sm bg-[var(--background)] p-3 rounded-lg overflow-auto whitespace-pre-wrap font-mono">
          {content}
        </pre>
      )}
    </div>
  );
}
