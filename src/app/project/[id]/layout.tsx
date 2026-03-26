'use client';

import { usePathname, useParams } from 'next/navigation';
import Link from 'next/link';
import { FileText, LayoutDashboard, MessageSquare, KanbanSquare, FileOutput, Settings, ArrowLeft } from 'lucide-react';

const navItems = [
  { href: '', label: 'Overview', icon: LayoutDashboard },
  { href: '/reviews', label: 'Reviews', icon: MessageSquare },
  { href: '/board', label: 'Board', icon: KanbanSquare },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/export', label: 'Export', icon: FileOutput },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const projectId = params.id as string;
  const basePath = `/project/${projectId}`;

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 bg-[var(--card)] border-r border-[var(--border)] flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-[var(--border)]">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-white transition-colors mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            <span className="font-semibold text-sm truncate">RebuttalHub</span>
          </div>
        </div>

        <nav className="flex-1 p-2">
          {navItems.map(({ href, label, icon: Icon }) => {
            const fullPath = `${basePath}${href}`;
            const isActive = href === ''
              ? pathname === basePath
              : pathname.startsWith(fullPath);

            return (
              <Link
                key={href}
                href={fullPath}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5 ${
                  isActive
                    ? 'bg-blue-500/10 text-blue-400 font-medium'
                    : 'text-[var(--muted-foreground)] hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
