import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconBg?: string;
  iconColor?: string;
  gradientClass?: string;
  className?: string;
}

export function MetricCard({ title, value, subtitle, icon: Icon, iconBg, iconColor, className }: MetricCardProps) {
  return (
    <Card className={cn("bg-card border border-border/60 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_6px_rgba(0,0,0,0.06)] transition-shadow duration-200", className)}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2.5">
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", iconBg || "bg-primary/10")}>
            <Icon className={cn("h-3.5 w-3.5", iconColor || "text-primary")} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground truncate">{title}</p>
            <p className="text-base font-bold tracking-tight text-foreground leading-tight">{value}</p>
            {subtitle && <p className="text-[10px] text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
