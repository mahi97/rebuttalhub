'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useProject } from '@/hooks/useProject';
import FileViewer from '@/components/project/FileViewer';
import { FileText, Code, Globe } from 'lucide-react';

const tabs = [
  { key: 'pdf', label: 'Paper (PDF)', icon: FileText, fileType: 'pdf' },
  { key: 'latex', label: 'LaTeX Source', icon: Code, fileType: 'zip' },
  { key: 'html', label: 'Reviews (HTML)', icon: Globe, fileType: 'html' },
];

export default function DocumentsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { files, loading } = useProject(projectId);
  const [activeTab, setActiveTab] = useState('pdf');

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-96" />
      </div>
    );
  }

  const activeFile = files.find((f) => {
    const tab = tabs.find((t) => t.key === activeTab);
    return f.file_type === tab?.fileType;
  });

  return (
    <div className="h-screen flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 p-3 border-b border-[var(--border)] bg-[var(--card)]">
        {tabs.map(({ key, label, icon: Icon, fileType }) => {
          const hasFile = files.some((f) => f.file_type === fileType);
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              disabled={!hasFile}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                activeTab === key
                  ? 'bg-blue-500/10 text-blue-400 font-medium'
                  : hasFile
                    ? 'text-[var(--muted-foreground)] hover:text-white hover:bg-white/5'
                    : 'text-[var(--muted-foreground)]/50 cursor-not-allowed'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {!hasFile && <span className="text-[10px]">(not uploaded)</span>}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeFile ? (
          <FileViewer file={activeFile} />
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--muted-foreground)]">
            <div className="text-center">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No file uploaded for this tab.</p>
              <p className="text-sm">Upload files in the Overview tab.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
