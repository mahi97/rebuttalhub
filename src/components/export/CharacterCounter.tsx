'use client';

interface CharacterCounterProps {
  current: number;
  limit: number;
}

export default function CharacterCounter({ current, limit }: CharacterCounterProps) {
  const percentage = limit > 0 ? (current / limit) * 100 : 0;

  let colorClass = 'text-green-400';
  let barColor = '#22c55e';

  if (percentage > 100) {
    colorClass = 'text-red-500 font-bold animate-pulse';
    barColor = '#ef4444';
  } else if (percentage > 95) {
    colorClass = 'text-red-400';
    barColor = '#ef4444';
  } else if (percentage > 80) {
    colorClass = 'text-yellow-400';
    barColor = '#eab308';
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className={colorClass}>
          {current.toLocaleString()} / {limit.toLocaleString()} characters
        </span>
        <span className={colorClass}>{Math.round(percentage)}%</span>
      </div>
      <div className="w-full h-2 bg-[var(--background)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${Math.min(percentage, 100)}%`,
            backgroundColor: barColor,
          }}
        />
      </div>
      {percentage > 100 && (
        <p className="text-xs text-red-400">
          Over limit by {(current - limit).toLocaleString()} characters
        </p>
      )}
    </div>
  );
}
