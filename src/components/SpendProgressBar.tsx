interface SpendProgressBarProps {
  amountSpent: number;
  spendCap: number;
}

export function SpendProgressBar({ amountSpent, spendCap }: SpendProgressBarProps) {
  if (spendCap <= 0) {
    return (
      <div className="w-full">
        <div className="text-sm font-medium text-muted-foreground">No cap</div>
      </div>
    );
  }

  const ratio = amountSpent / spendCap;
  const percentage = Math.min(ratio * 100, 100);
  const remaining = Math.max(spendCap - amountSpent, 0);

  const barColor =
    ratio >= 0.8
      ? "bg-destructive"
      : ratio >= 0.5
        ? "bg-yellow-500 dark:bg-yellow-400"
        : "bg-blue-500 dark:bg-blue-400";

  return (
    <div className="w-full min-w-[80px]">
      <div className="text-sm font-semibold whitespace-nowrap text-foreground">
        ${remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} left
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden mt-1">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}