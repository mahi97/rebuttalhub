'use client';

import { useState } from 'react';
import { X, Key, Loader2, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

interface ApiKeyModalProps {
  onClose: () => void;
  onSaved?: () => void;
}

export default function ApiKeyModal({ onClose, onSaved }: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [valid, setValid] = useState<boolean | null>(null);

  const handleTest = async () => {
    if (!apiKey.trim()) return;
    setTesting(true);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      setValid(res.ok);
      if (res.ok) toast.success('API key is valid');
      else toast.error('Invalid API key');
    } catch {
      setValid(false);
      toast.error('Could not validate key');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('profiles')
        .update({ anthropic_api_key: apiKey.trim() })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('API key saved');
      onSaved?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save API key');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold">Anthropic API Key</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          Enter your Anthropic API key to enable AI features. Your key is stored securely and never exposed to the browser during AI calls.
        </p>

        <div className="space-y-3">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setValid(null); }}
            placeholder="sk-ant-api03-..."
            className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          <div className="flex gap-2">
            <button
              onClick={handleTest}
              disabled={testing || !apiKey.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm hover:border-blue-500/50 transition-colors disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : valid === true ? <Check className="w-4 h-4 text-green-400" /> : null}
              Test Key
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !apiKey.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save Key
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
