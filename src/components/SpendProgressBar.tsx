interface SpendProgressBarProps {
  amountSpent: number;
  spendCap: number;
}

export function SpendProgressBar({ amountSpent, spendCap }: SpendProgressBarProps) {
  if (spendCap <= 0) {
    return (
      <div className="w-full">
        <div className="text-xs font-medium text-muted-foreground">No cap</div>
      </div>
    );
  }

  const ratio = amountSpent / spendCap;
  const percentage = Math.min(ratio * 100, 100);
  const remaining = Math.max(spendCap - amountSpent, 0);

  const barColor =
    ratio >= 0.9
      ? "bg-destructive"
      : ratio >= 0.7
        ? "bg-amber-500"
        : "bg-primary";

  return (
    <div className="w-full min-w-[90px]">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-xs font-semibold tabular-nums">
          ${remaining.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          / ${spendCap.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
