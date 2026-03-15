interface SpendProgressBarProps {
  amountSpent: number;
  spendCap: number;
}

export function SpendProgressBar({ amountSpent, spendCap }: SpendProgressBarProps) {
  if (spendCap <= 0) {
    return (
      <div className="w-full">
        <div className="flex justify-between text-[10px] mb-0.5">
          <span>${amountSpent.toLocaleString()}</span>
          <span className="text-muted-foreground">No cap</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted" />
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
    <div className="w-full min-w-[110px]">
      <div className="flex justify-between text-[10px] mb-0.5">
        <span>${amountSpent.toLocaleString()}</span>
        <span className="text-muted-foreground">${spendCap.toLocaleString()}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="text-[10px] mt-0.5 font-semibold text-muted-foreground">
        Remaining: <span className={`${ratio >= 0.8 ? 'text-destructive' : ratio >= 0.5 ? 'text-yellow-600' : 'text-green-600'}`}>${remaining.toLocaleString()}</span>
      </div>
    </div>
  );
}
