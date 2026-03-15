import React from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { NotificationBell } from "@/components/NotificationBell";
import { ChatWidget } from "@/components/ChatWidget";
import { useAuth } from "@/contexts/AuthContext";
import { Zap } from "lucide-react";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { logoUrl, headerAnnouncement } = useSiteSettings();
  const { isAdmin } = useAuth();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b bg-card px-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <SidebarTrigger />
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-7 w-7 rounded object-contain flex-shrink-0" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded bg-primary flex-shrink-0">
                  <Zap className="h-3.5 w-3.5 text-primary-foreground" />
                </div>
              )}
              {headerAnnouncement ? (
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="announcement-ticker">
                    <span className="text-sm font-medium text-primary whitespace-nowrap">
                      {headerAnnouncement}
                    </span>
                  </div>
                </div>
              ) : null}
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
