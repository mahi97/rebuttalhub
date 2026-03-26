import LoginButton from '@/components/auth/LoginButton';
import { FileText } from 'lucide-react';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold mb-2">RebuttalHub</h1>
          <p className="text-[var(--muted-foreground)]">
            Collaborative paper rebuttal management
          </p>
        </div>

        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
          <div className="space-y-3">
            <LoginButton provider="google" />
            <LoginButton provider="github" />
          </div>

          <p className="text-xs text-center text-[var(--muted-foreground)] mt-4">
            Sign in to manage your paper rebuttals with your team.
          </p>
        </div>
      </div>
    </div>
  );
}
