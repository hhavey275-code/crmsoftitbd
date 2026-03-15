interface SpendProgressBarProps {
  amountSpent: number;
  spendCap: number;
}

export function SpendProgressBar({ amountSpent, spendCap }: SpendProgressBarProps) {
  if (spendCap <= 0) {
    return (
      <div className="w-full">
        <div className="flex justify-between text-xs mb-1">
          <span>${amountSpent.toLocaleString()}</span>
          <span className="text-muted-foreground">No cap</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted" />
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
        ? "bg-yellow-500"
        : "bg-green-500";

  return (
    <div className="w-full min-w-[140px]">
      <div className="flex justify-between text-xs mb-1">
        <span>Spent: ${amountSpent.toLocaleString()}</span>
        <span className="text-muted-foreground">Cap: ${spendCap.toLocaleString()}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="text-xs mt-1 text-muted-foreground">
        Remaining: <span className={`font-medium ${ratio >= 0.8 ? 'text-destructive' : ratio >= 0.5 ? 'text-yellow-600' : 'text-green-600'}`}>${remaining.toLocaleString()}</span>
      </div>
    </div>
  );
}
