'use client';

import { useState } from 'react';
import { Copy, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface InviteModalProps {
  inviteCode: string;
  onClose: () => void;
}

export default function InviteModal({ inviteCode, onClose }: InviteModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    toast.success('Invite code copied');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Invite Collaborators</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          Share this invite code with your collaborators so they can join the project.
        </p>

        <div className="flex items-center gap-2">
          <div className="flex-1 px-4 py-3 bg-[var(--background)] rounded-lg font-mono text-lg tracking-wider text-center">
            {inviteCode}
          </div>
          <button
            onClick={handleCopy}
            className="p-3 rounded-lg bg-blue-500 hover:bg-blue-600 transition-colors"
          >
            {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
