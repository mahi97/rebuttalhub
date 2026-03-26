'use client';

import { useMemo } from 'react';

interface RebuttalDiffViewProps {
  before: string;
  after: string;
}

type DiffLine = {
  type: 'context' | 'added' | 'removed';
  text: string;
};

function buildLineDiff(before: string, after: string): DiffLine[] {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  const dp: number[][] = Array.from({ length: beforeLines.length + 1 }, () =>
    Array(afterLines.length + 1).fill(0)
  );

  for (let i = beforeLines.length - 1; i >= 0; i -= 1) {
    for (let j = afterLines.length - 1; j >= 0; j -= 1) {
      if (beforeLines[i] === afterLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < beforeLines.length && j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      lines.push({ type: 'context', text: beforeLines[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: 'removed', text: beforeLines[i] });
      i += 1;
    } else {
      lines.push({ type: 'added', text: afterLines[j] });
      j += 1;
    }
  }

  while (i < beforeLines.length) {
    lines.push({ type: 'removed', text: beforeLines[i] });
    i += 1;
  }

  while (j < afterLines.length) {
    lines.push({ type: 'added', text: afterLines[j] });
    j += 1;
  }

  return lines;
}

export default function RebuttalDiffView({ before, after }: RebuttalDiffViewProps) {
  const lines = useMemo(() => buildLineDiff(before, after), [before, after]);

  const summary = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        if (line.type === 'added') acc.added += 1;
        if (line.type === 'removed') acc.removed += 1;
        return acc;
      },
      { added: 0, removed: 0 }
    );
  }, [lines]);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-3 text-xs text-[var(--muted-foreground)]">
        <span>Diff preview</span>
        <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-green-300">
          +{summary.added}
        </span>
        <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-red-300">
          -{summary.removed}
        </span>
      </div>

      <div className="max-h-[420px] overflow-auto font-mono text-xs">
        {lines.map((line, index) => {
          const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
          const lineClass =
            line.type === 'added'
              ? 'bg-green-500/8 text-green-100'
              : line.type === 'removed'
                ? 'bg-red-500/8 text-red-100'
                : 'text-[var(--muted-foreground)]';

          return (
            <div
              key={`${line.type}-${index}-${line.text}`}
              className={`whitespace-pre-wrap border-b border-white/5 px-4 py-1.5 ${lineClass}`}
            >
              <span className="mr-3 inline-block w-3 select-none text-center">{prefix}</span>
              {line.text || ' '}
            </div>
          );
        })}
      </div>
    </div>
  );
}
