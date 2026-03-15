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
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
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

const adminNavItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Ad Accounts", url: "/ad-accounts", icon: MonitorSmartphone },
  { title: "Business Managers", url: "/business-managers", icon: Building2 },
  { title: "Top-Up Request", url: "/top-up", icon: ArrowUpCircle },
  { title: "Transactions", url: "/transactions", icon: History },
  { title: "Banks", url: "/banks", icon: Landmark },
  { title: "Settings", url: "/settings", icon: Settings },
];

const clientNavItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Ad Accounts", url: "/ad-accounts", icon: MonitorSmartphone },
  { title: "Top-Up Request", url: "/top-up", icon: ArrowUpCircle },
  { title: "Transactions", url: "/transactions", icon: History },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut, profile, role } = useAuth();
  const { logoUrl, siteName } = useSiteSettings();

  const navItems = role === "admin" ? adminNavItems : clientNavItems;
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
