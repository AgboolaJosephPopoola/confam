import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { Mail, Hash, Lock, Power, Save, CheckCircle, Sun, Moon, Monitor } from "lucide-react";

interface Company {
  id: string;
  name: string;
  company_code: string;
  staff_pin: string;
  system_active: boolean;
  gmail_connected: boolean;
}

interface AdminSettingsProps {
  company: Company;
  onUpdate: () => void;
}

export function AdminSettings({ company, onUpdate }: AdminSettingsProps) {
  const [name, setName] = useState(company.name);
  const [code, setCode] = useState(company.company_code);
  const [pin, setPin] = useState(company.staff_pin);
  const [systemActive, setSystemActive] = useState(company.system_active);
  const [saving, setSaving] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(company.gmail_connected);

  const { theme, setTheme } = useTheme();

  const handleSave = async () => {
    if (!code.trim() || !pin.trim() || !name.trim()) {
      toast.error("All fields are required");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("companies")
      .update({
        name: name.trim(),
        company_code: code.trim().toUpperCase(),
        staff_pin: pin.trim(),
        system_active: systemActive,
      })
      .eq("id", company.id);

    if (error) {
      toast.error(error.message.includes("unique") ? "That company code is already taken." : "Save failed");
    } else {
      toast.success("Settings saved!");
      onUpdate();
    }
    setSaving(false);
  };

  const handleGmailConnect = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/gmail.modify",
        redirectTo: `${window.location.origin}/admin-login`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (error) toast.error("Could not start Google OAuth");
  };

  const themeOptions = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ] as const;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Company Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">Configure your workspace and access credentials</p>
      </div>

      {/* Appearance */}
      <Section title="Appearance" description="Choose your preferred color scheme">
        <div className="grid grid-cols-3 gap-2">
          {themeOptions.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all ${
                theme === value
                  ? "border-emerald-brand/60 bg-emerald-dim text-emerald-brand"
                  : "border-surface-3 bg-surface-2 text-muted-foreground hover:text-foreground hover:border-surface-3"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </Section>

      {/* Gmail Integration */}
      <Section title="Gmail Integration" description="Connect your Gmail to auto-import payment alerts">
        <div className="flex items-center justify-between p-4 rounded-xl bg-surface-2 border border-surface-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-surface-3 flex items-center justify-center">
              <Mail className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {gmailConnected ? "Gmail Connected" : "Connect Gmail"}
              </p>
              <p className="text-xs text-muted-foreground">
                {gmailConnected
                  ? "Auto-polling active · Extracts payments via AI"
                  : "Authorize Gmail read access for bank alert sync"}
              </p>
            </div>
          </div>
          {gmailConnected ? (
            <div className="flex items-center gap-1.5 text-xs text-emerald-brand font-medium">
              <CheckCircle className="w-4 h-4" />
              Active
            </div>
          ) : (
            <button
              onClick={handleGmailConnect}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-3 text-foreground hover:bg-surface-2 border border-surface-3 transition-all"
            >
              Connect →
            </button>
          )}
        </div>
      </Section>

      {/* Access Credentials */}
      <Section title="Staff Access Credentials" description="Staff enter these on the kiosk login screen">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Company Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface-2 border border-surface-3 rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-emerald-brand/50 focus:ring-1 focus:ring-emerald-brand/30"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5" /> Company Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full bg-surface-2 border border-surface-3 rounded-lg px-4 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-emerald-brand/50 focus:ring-1 focus:ring-emerald-brand/30 uppercase"
              placeholder="MC-2026"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Staff PIN
            </label>
            <input
              type="text"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              maxLength={8}
              className="w-full bg-surface-2 border border-surface-3 rounded-lg px-4 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-emerald-brand/50 focus:ring-1 focus:ring-emerald-brand/30 tracking-widest"
              placeholder="1234"
            />
          </div>
        </div>
      </Section>

      {/* System Toggle */}
      <Section title="System Control" description="Pause the system to prevent staff from logging in">
        <div className="flex items-center justify-between p-4 rounded-xl bg-surface-2 border border-surface-3">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${systemActive ? "bg-emerald-dim" : "bg-surface-3"}`}>
              <Power className={`w-4 h-4 ${systemActive ? "text-emerald-brand" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                System {systemActive ? "Active" : "Paused"}
              </p>
              <p className="text-xs text-muted-foreground">
                {systemActive
                  ? "Staff can access the kiosk"
                  : "Kiosk logins are blocked"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setSystemActive(!systemActive)}
            className="relative w-11 h-6 rounded-full transition-colors duration-200"
            style={{ background: systemActive ? "hsl(var(--emerald))" : "hsl(var(--surface-3))" }}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                systemActive ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </Section>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 active:scale-95 text-primary-foreground"
        style={{ background: "hsl(var(--emerald))" }}
      >
        <Save className="w-4 h-4" />
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}

function Section({
  title, description, children,
}: {
  title: string; description: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  );
}
