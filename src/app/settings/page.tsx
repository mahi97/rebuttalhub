'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Key, User, Loader2, Check, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import type { Profile } from '@/types';

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (data) {
        setProfile(data);
        setDisplayName(data.display_name || '');
        setApiKey(data.anthropic_api_key || '');
      }
    }
    load();
  }, [supabase]);

  const handleTestKey = async () => {
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
          messages: [{ role: 'user', content: 'test' }],
        }),
      });
      setKeyValid(res.ok);
      toast[res.ok ? 'success' : 'error'](res.ok ? 'API key is valid' : 'Invalid API key');
    } catch {
      setKeyValid(false);
      toast.error('Could not validate key');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName,
          anthropic_api_key: apiKey.trim() || null,
        })
        .eq('id', profile.id);

      if (error) throw error;
      toast.success('Settings saved');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--card)]/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-3xl mx-auto flex items-center gap-4 px-6 py-3">
          <Link href="/dashboard" className="text-[var(--muted-foreground)] hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Profile */}
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-400" />
            Profile
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-1 block">
                Email
              </label>
              <p className="text-sm px-4 py-2.5 bg-[var(--background)] rounded-lg text-[var(--muted-foreground)]">
                {profile.email}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-1 block">
                Display Name
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* API Key */}
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <Key className="w-5 h-5 text-blue-400" />
            Anthropic API Key
          </h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            Your API key is used for AI features (drafting responses, parsing reviews, etc.).
            It is stored securely and only used server-side.
          </p>
          <div className="space-y-3">
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setKeyValid(null); }}
                placeholder="sk-ant-api03-..."
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-white"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleTestKey}
                disabled={testing || !apiKey.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm hover:border-blue-500/50 transition-colors disabled:opacity-50"
              >
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : keyValid === true ? <Check className="w-4 h-4 text-green-400" /> : null}
                Test Key
              </button>
            </div>
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save Settings
        </button>
      </main>
    </div>
  );
}
