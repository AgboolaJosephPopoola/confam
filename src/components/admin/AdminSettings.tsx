// -- ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS connected_banks TEXT[] DEFAULT '{}';

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import {
  Mail, Hash, Lock, Power, Save, CheckCircle, Sun, Moon, Monitor,
  Plus, X, Check, Building2,
} from "lucide-react";

interface Company {
  id: string;
  name: string;
  company_code: string;
  staff_pin: string;
  system_active: boolean;
  gmail_connected: boolean;
  connected_banks?: string[];
}

interface AdminSettingsProps {
  company: Company;
  onUpdate: () => void;
}

const DEFAULT_BANKS: { name: string; domain: string }[] = [
  { name: "GTBank", domain: "gtbank.com" },
  { name: "Access Bank", domain: "accessbankplc.com" },
  { name: "Zenith Bank", domain: "zenithbank.com" },
  { name: "UBA", domain: "ubagroup.com" },
  { name: "First Bank", domain: "firstbanknig.com" },
  { name: "Opay", domain: "opay-nigeria.com" },
  { name: "Moniepoint", domain: "moniepoint.com" },
  { name: "Kuda", domain: "kuda.co" },
  { name: "ALAT", domain: "alat.ng" },
  { name: "Safe Haven", domain: "safehavenmfb.com" },
  { name: "Wema Bank", domain: "wemabank.com" },
  { name: "Fidelity Bank", domain: "fidelitybank.ng" },
  { name: "Ecobank", domain: "ecobank.com" },
  { name: "FairMoney", domain: "fairmoney.ng" },
  { name: "Stanbic IBTC", domain: "stanbicibtc.com" },
];

function BankFavicon({ domain, name }: { domain: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="w-8 h-8 rounded-lg bg-emerald-dim flex items-center justify-center text-xs font-bold text-emerald-brand flex-shrink-0">
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
      alt={name}
      className="w-8 h-8 rounded-lg flex-shrink-0 object-contain"
      onError={() => setFailed(true)}
    />
  );
}

export function AdminSettings({ company, onUpdate }: AdminSettingsProps) {
  const [name, setName] = useState(company.name);
  const [code, setCode] = useState(company.company_code);
  const [pin, setPin] = useState(company.staff_pin);
  const [systemActive, setSystemActive] = useState(company.system_active);
  const [saving, setSaving] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(company.gmail_connected);

  // Connected banks
  const [selectedBanks, setSelectedBanks] = useState<string[]>(company.connected_banks ?? []);
  const [customBanks, setCustomBanks] = useState<{ name: string; domain: string }[]>([]);
  const [addingCustom, setAddingCustom] = useState(false);
  const [customBankName, setCustomBankName] = useState("");

  const { theme, setTheme } = useTheme();

  const toggleBank = (bankName: string) => {
    setSelectedBanks((prev) =>
      prev.includes(bankName) ? prev.filter((b) => b !== bankName) : [...prev, bankName]
    );
  };

  const addCustomBank = () => {
    const trimmed = customBankName.trim();
    if (!trimmed) return;
    if ([...DEFAULT_BANKS, ...customBanks].some((b) => b.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Bank already exists");
      return;
    }
    const domain = trimmed.toLowerCase().replace(/\s+/g, "") + ".com";
    setCustomBanks((prev) => [...prev, { name: trimmed, domain }]);
    setSelectedBanks((prev) => [...prev, trimmed]);
    setCustomBankName("");
    setAddingCustom(false);
  };

  const removeCustomBank = (bankName: string) => {
    setCustomBanks((prev) => prev.filter((b) => b.name !== bankName));
    setSelectedBanks((prev) => prev.filter((b) => b !== bankName));
  };

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
        connected_banks: selectedBanks,
      } as any)
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

  const allBanks = [...DEFAULT_BANKS, ...customBanks];

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

      {/* Connected Banks */}
      <Section title="Connected Banks" description="Select the banks you receive payment alerts from">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {allBanks.map((bank) => {
            const isSelected = selectedBanks.includes(bank.name);
            const isCustom = customBanks.some((c) => c.name === bank.name);
            return (
              <button
                key={bank.name}
                onClick={() => toggleBank(bank.name)}
                className={`relative flex items-center gap-2.5 p-3 rounded-xl border text-left text-sm font-medium transition-all ${
                  isSelected
                    ? "border-emerald-brand/60 bg-emerald-dim"
                    : "border-surface-3 bg-surface-2 text-muted-foreground hover:text-foreground"
                }`}
              >
                <BankFavicon domain={bank.domain} name={bank.name} />
                <span className={`truncate text-xs ${isSelected ? "text-emerald-brand" : ""}`}>
                  {bank.name}
                </span>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-emerald-brand absolute top-1.5 right-1.5" />
                )}
                {isCustom && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCustomBank(bank.name);
                    }}
                    className="absolute bottom-1.5 right-1.5 text-muted-foreground hover:text-destructive transition-colors"
                    title="Remove custom bank"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </button>
            );
          })}

          {/* Add Custom Bank */}
          {addingCustom ? (
            <div className="flex items-center gap-2 p-2 rounded-xl border border-emerald-brand/40 bg-surface-2 col-span-2 sm:col-span-3">
              <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input
                type="text"
                value={customBankName}
                onChange={(e) => setCustomBankName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomBank()}
                placeholder="Bank name…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                autoFocus
              />
              <button
                onClick={addCustomBank}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-dim text-emerald-brand hover:bg-emerald-brand/20 transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => { setAddingCustom(false); setCustomBankName(""); }}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingCustom(true)}
              className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-surface-3 text-muted-foreground hover:text-foreground hover:border-emerald-brand/40 transition-all text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Custom Bank
            </button>
          )}
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