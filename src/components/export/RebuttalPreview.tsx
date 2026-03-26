'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface RebuttalPreviewProps {
  content: string;
}

export default function RebuttalPreview({ content }: RebuttalPreviewProps) {
  if (!content) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--muted-foreground)]">
        <p>Generate a rebuttal to see the preview here.</p>
      </div>
    );
  }

  return (
    <div className="markdown-content bg-[var(--background)] rounded-lg p-6 max-h-[600px] overflow-auto">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
