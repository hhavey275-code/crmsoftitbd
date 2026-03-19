import {
  LayoutDashboard,
  MonitorSmartphone,
  ArrowUpCircle,
  History,
  Settings,
  LogOut,
  Zap,
  Building2,
  Landmark,
  Users,
  Receipt,
  MessageCircle,
  ScrollText,
  AlertTriangle,
  FileText,
  Store,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useSidebarBadges } from "@/hooks/useSidebarBadges";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const adminNavItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, key: "dashboard" },
  { title: "Ad Accounts", url: "/ad-accounts", icon: MonitorSmartphone, key: "ad-accounts" },
  { title: "Failed Top-Ups", url: "/failed-topups", icon: AlertTriangle, key: "failed-topups" },
  { title: "Requests", url: "/requests", icon: FileText, key: "requests" },
  { title: "Billings", url: "/billings", icon: Receipt, key: "billings" },
  { title: "Business Managers", url: "/business-managers", icon: Building2, key: "business-managers" },
  { title: "Top-Up Request", url: "/top-up", icon: ArrowUpCircle, key: "top-up" },
  { title: "Clients", url: "/clients", icon: Users, key: "clients" },
  { title: "Transactions", url: "/transactions", icon: History, key: "transactions" },
  { title: "Banks", url: "/banks", icon: Landmark, key: "banks" },
  { title: "Chat Support", url: "/chat", icon: MessageCircle, key: "chat" },
  { title: "Sellers", url: "/sellers", icon: Store, key: "sellers" },
  { title: "System Log", url: "/system-logs", icon: ScrollText, key: "system-logs" },
  { title: "Settings", url: "/settings", icon: Settings, key: "settings" },
];

const clientNavItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, key: "dashboard" },
  { title: "Ad Accounts", url: "/ad-accounts", icon: MonitorSmartphone, key: "ad-accounts" },
  { title: "Top-Up Request", url: "/top-up", icon: ArrowUpCircle, key: "top-up" },
  { title: "Failed Top-Ups", url: "/failed-topups", icon: AlertTriangle, key: "failed-topups" },
  { title: "Transactions", url: "/transactions", icon: History, key: "transactions" },
  { title: "Settings", url: "/settings", icon: Settings, key: "settings" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut, profile, role, isAdmin, isSuperAdmin, user } = useAuth();
  const { logoUrl, siteName } = useSiteSettings();
  const badges = useSidebarBadges();

  // Fetch menu permissions for admin (non-superadmin) users
  const { data: menuPermissions } = useQuery({
    queryKey: ["menu-permissions", user?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("menu_permissions")
        .select("menu_key")
        .eq("user_id", user!.id);
      return (data as any[])?.map((p: any) => p.menu_key) ?? [];
    },
    enabled: !!user && role === "admin",
  });

  let navItems: typeof adminNavItems;
  if (isSuperAdmin) {
    navItems = adminNavItems;
  } else if (role === "admin") {
    // Filter based on menu_permissions - if no permissions set, show all
    if (menuPermissions && menuPermissions.length > 0) {
      navItems = adminNavItems.filter(item => menuPermissions.includes(item.key));
    } else {
      navItems = adminNavItems;
    }
  } else {
    navItems = clientNavItems;
  }

  const displayName = siteName || "Meta Ad Top-Up";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 py-6 mt-4 h-auto">
            {!collapsed && (
              <div className="flex items-center gap-4">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="h-12 w-12 rounded-lg object-contain" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
                    <Zap className="h-6 w-6 text-primary-foreground" />
                  </div>
                )}
                <div>
                  <p className="text-base font-semibold text-sidebar-foreground leading-tight">{displayName}</p>
                  <p className="text-xs text-sidebar-muted capitalize mt-1">{role ?? "—"}</p>
                </div>
              </div>
            )}
            {collapsed && (
              <>
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="h-10 w-10 rounded-lg object-contain" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                    <Zap className="h-5 w-5 text-primary-foreground" />
                  </div>
                )}
              </>
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <div className="relative mr-2">
                        <item.icon className="h-4 w-4" />
                        {(badges[item.key] ?? 0) > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-destructive-foreground">
                            {badges[item.key] > 9 ? "9+" : badges[item.key]}
                          </span>
                        )}
                      </div>
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3">
        {!collapsed && profile && (
          <div className="mb-2 rounded-md bg-sidebar-accent p-3">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {profile.full_name || profile.email || "User"}
            </p>
            <p className="text-xs text-sidebar-muted truncate">{profile.email}</p>
          </div>
        )}
        <Button
          variant="ghost"
          className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-destructive"
          onClick={signOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && "Sign Out"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
