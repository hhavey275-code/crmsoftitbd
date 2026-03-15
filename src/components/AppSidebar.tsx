import {
  LayoutDashboard,
  Wallet,
  MonitorSmartphone,
  ArrowUpCircle,
  History,
  Settings,
  LogOut,
  Zap,
  Building2,
  Landmark,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteSettings } from "@/hooks/useSiteSettings";
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

const commonNavItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Wallet", url: "/wallet", icon: Wallet },
  { title: "Ad Accounts", url: "/ad-accounts", icon: MonitorSmartphone },
  { title: "Top-Up", url: "/top-up", icon: ArrowUpCircle },
  { title: "Transactions", url: "/transactions", icon: History },
  { title: "Settings", url: "/settings", icon: Settings },
];

const adminOnlyItems = [
  { title: "Business Managers", url: "/business-managers", icon: Building2 },
  { title: "Banks", url: "/banks", icon: Landmark },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, profile, role } = useAuth();
  const { logoUrl } = useSiteSettings();

  const navItems = role === "admin"
    ? [...commonNavItems.slice(0, 1), ...adminOnlyItems, ...commonNavItems.slice(1)]
    : commonNavItems;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 py-4">
            {!collapsed && (
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded-lg object-contain" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                    <Zap className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-sidebar-foreground">Meta Ad Top-Up</p>
                  <p className="text-xs text-sidebar-muted capitalize">{role ?? "—"}</p>
                </div>
              </div>
            )}
            {collapsed && (
              <>
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded-lg object-contain" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                    <Zap className="h-4 w-4 text-primary-foreground" />
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
                      <item.icon className="mr-2 h-4 w-4" />
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
