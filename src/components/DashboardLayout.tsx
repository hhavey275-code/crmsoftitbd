import React from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { NotificationBell } from "@/components/NotificationBell";
import { Zap } from "lucide-react";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { logoUrl } = useSiteSettings();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border/60 bg-card/80 backdrop-blur-sm px-4 sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-7 w-7 rounded object-contain" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded bg-primary">
                  <Zap className="h-3.5 w-3.5 text-primary-foreground" />
                </div>
              )}
              <span className="text-sm font-semibold text-foreground">Meta Ad Top-Up</span>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
            </div>
          </header>
          <main className="flex-1 p-6 overflow-auto">
            <div className="mx-auto max-w-[1400px]">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
