import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  LayoutDashboard, Settings, Users, Zap, LogOut,
  ChevronRight, RefreshCw, PlusCircle, TrendingUp,
} from "lucide-react";
import { BossDashboardHome } from "./BossDashboardHome";
import { BossSettings } from "./BossSettings";

type NavTab = "dashboard" | "settings" | "staff";

interface Company {
  id: string;
  name: string;
  company_code: string;
  staff_pin: string;
  system_active: boolean;
  gmail_connected: boolean;
}

export function BossDashboard() {
  const { bossUser, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>("dashboard");
  const [company, setCompany] = useState<Company | null>(null);
  const [loadingCompany, setLoadingCompany] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    fetchCompany();
  }, [bossUser]);

  const fetchCompany = async () => {
    if (!bossUser) return;
    setLoadingCompany(true);
    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .eq("owner_id", bossUser.id)
      .maybeSingle();
    if (!error) setCompany(data);
    setLoadingCompany(false);
  };

  const createCompany = async () => {
    if (!bossUser) return;
    const { data, error } = await supabase
      .from("companies")
      .insert({
        name: "My Company",
        company_code: "MC-" + Math.floor(1000 + Math.random() * 9000),
        staff_pin: "1234",
        owner_id: bossUser.id,
      })
      .select()
      .single();
    if (error) {
      toast.error("Failed to create company");
      return;
    }
    setCompany(data);
    toast.success("Company workspace created!");
    setActiveTab("settings");
  };

  const navItems: { id: NavTab; label: string; icon: React.ElementType }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "settings", label: "Settings", icon: Settings },
    { id: "staff", label: "Staff Access", icon: Users },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-surface-3 transition-all duration-300 ${
          sidebarCollapsed ? "w-16" : "w-60"
        }`}
        style={{ background: "hsl(var(--sidebar-background))" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-surface-3">
          <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-dim border border-emerald-brand/30">
            <Zap className="w-4 h-4 text-emerald-brand" />
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground truncate">Confam Pay</p>
              <p className="text-xs text-muted-foreground truncate">
                {company?.name ?? "No Company"}
              </p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`nav-item w-full ${activeTab === id ? "active" : ""} ${
                sidebarCollapsed ? "justify-center px-2" : ""
              }`}
              title={sidebarCollapsed ? label : undefined}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!sidebarCollapsed && <span>{label}</span>}
              {!sidebarCollapsed && activeTab === id && (
                <ChevronRight className="w-3 h-3 ml-auto text-emerald-brand" />
              )}
            </button>
          ))}
        </nav>

        {/* System status */}
        {!sidebarCollapsed && company && (
          <div className="m-3 p-3 rounded-lg bg-surface-2 border border-surface-3">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  company.system_active ? "bg-emerald-brand animate-glow-pulse" : "bg-muted-foreground"
                }`}
              />
              <span className="text-xs text-muted-foreground">
                System {company.system_active ? "Active" : "Paused"}
              </span>
            </div>
          </div>
        )}

        {/* Bottom: collapse + sign out */}
        <div className="p-3 border-t border-surface-3 space-y-1">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="nav-item w-full"
            title="Toggle sidebar"
          >
            <ChevronRight
              className={`w-4 h-4 flex-shrink-0 transition-transform ${sidebarCollapsed ? "" : "rotate-180"}`}
            />
            {!sidebarCollapsed && <span className="text-xs">Collapse</span>}
          </button>
          <button
            onClick={signOut}
            className="nav-item w-full text-destructive/80 hover:text-destructive"
            title="Sign out"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">
        {/* Top bar */}
        <header className="h-16 border-b border-surface-3 flex items-center justify-between px-6 bg-surface-1/50 sticky top-0 z-10 backdrop-blur-sm">
          <div>
            <h1 className="text-sm font-semibold text-foreground capitalize">{activeTab}</h1>
            <p className="text-xs text-muted-foreground">{bossUser?.email}</p>
          </div>
          <div className="flex items-center gap-3">
            {company && (
              <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground bg-surface-2 px-3 py-1.5 rounded-full border border-surface-3">
                <TrendingUp className="w-3 h-3 text-emerald-brand" />
                Code: <span className="font-mono text-foreground">{company.company_code}</span>
              </span>
            )}
            <button
              onClick={fetchCompany}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="p-6">
          {loadingCompany ? (
            <div className="flex items-center justify-center h-64">
              <div className="space-y-3 text-center">
                <div className="w-8 h-8 border-2 border-emerald-brand border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-muted-foreground">Loading workspace…</p>
              </div>
            </div>
          ) : !company ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold">No company workspace</h3>
                <p className="text-sm text-muted-foreground">Create your company to get started</p>
              </div>
              <button
                onClick={createCompany}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{ background: "hsl(var(--emerald))", color: "white" }}
              >
                <PlusCircle className="w-4 h-4" />
                Create Company Workspace
              </button>
            </div>
          ) : activeTab === "dashboard" ? (
            <BossDashboardHome company={company} />
          ) : activeTab === "settings" ? (
            <BossSettings company={company} onUpdate={fetchCompany} />
          ) : (
            <StaffInfoPanel company={company} />
          )}
        </div>
      </main>
    </div>
  );
}

function StaffInfoPanel({ company }: { company: Company }) {
  return (
    <div className="max-w-md space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Staff Access Credentials</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Share these with your staff for kiosk access
        </p>
      </div>
      <div className="glass-card rounded-xl p-6 space-y-5">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Company Code</p>
          <p className="font-mono text-2xl font-bold text-emerald-brand tracking-widest">
            {company.company_code}
          </p>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Staff PIN</p>
          <p className="font-mono text-2xl font-bold text-foreground tracking-widest">
            {company.staff_pin}
          </p>
        </div>
        <div className="pt-3 border-t border-surface-3">
          <p className="text-xs text-muted-foreground">
            Staff will use these on the kiosk login screen to view today's transactions.
            Change these in Settings anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
