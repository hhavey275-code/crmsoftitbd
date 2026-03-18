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
  size?: "sm" | "default";
}

export function MetricCard({ title, value, subtitle, icon: Icon, iconBg, iconColor, className, size = "default" }: MetricCardProps) {
  const isSmall = size === "sm";

  return (
    <Card className={cn("bg-card border border-border/60 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_6px_rgba(0,0,0,0.06)] transition-shadow duration-200", className)}>
      <CardContent className={isSmall ? "p-3" : "p-5"}>
        <div className="flex items-center gap-3">
          <div className={cn("flex shrink-0 items-center justify-center rounded-lg", isSmall ? "h-8 w-8" : "h-10 w-10", iconBg || "bg-primary/10")}>
            <Icon className={cn(isSmall ? "h-3.5 w-3.5" : "h-5 w-5", iconColor || "text-primary")} />
          </div>
          <div className="min-w-0">
            <p className={cn("font-medium text-muted-foreground truncate", isSmall ? "text-xs" : "text-sm")}>{title}</p>
            <p className={cn("font-bold tracking-tight text-foreground leading-tight", isSmall ? "text-base" : "text-xl")}>{value}</p>
            {subtitle && <p className={cn("text-muted-foreground truncate", isSmall ? "text-[10px]" : "text-xs")}>{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
