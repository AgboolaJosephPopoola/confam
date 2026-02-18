import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setStaffSession } from "@/lib/staffSession";
import { toast } from "sonner";
import { Zap, Eye, EyeOff, Lock, Hash } from "lucide-react";

interface StaffKioskLoginProps {
  onSuccess: () => void;
}

export function StaffKioskLogin({ onSuccess }: StaffKioskLoginProps) {
  const [companyCode, setCompanyCode] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyCode.trim() || !pin.trim()) {
      toast.error("Enter company code and PIN");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("validate_staff_login", {
        p_company_code: companyCode.trim().toUpperCase(),
        p_staff_pin: pin.trim(),
      });

      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error("Invalid code or PIN. Try again.");
        setLoading(false);
        return;
      }

      const { company_id, company_name } = data[0] as { company_id: string; company_name: string };
      setStaffSession({
        companyId: company_id,
        companyName: company_name,
        companyCode: companyCode.trim().toUpperCase(),
        staffPin: pin.trim(),
      });
      toast.success(`Welcome to ${company_name}`);
      onSuccess();
    } catch (err: unknown) {
      toast.error("Login failed. Check your credentials.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-dim border border-emerald-brand/30 animate-glow-pulse">
          <Zap className="w-8 h-8 text-emerald-brand" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">PayWatch</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Staff Kiosk Terminal</p>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm glass-card rounded-2xl p-6 shadow-card">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-foreground">Staff Access</h2>
          <p className="text-sm text-muted-foreground mt-1">Enter your company credentials to continue</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Company Code
            </label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                placeholder="MC-2026"
                className="w-full bg-surface-2 border border-surface-3 rounded-lg pl-10 pr-4 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-brand/50 focus:ring-1 focus:ring-emerald-brand/30 transition-colors"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Access PIN
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type={showPin ? "text" : "password"}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                maxLength={8}
                className="w-full bg-surface-2 border border-surface-3 rounded-lg pl-10 pr-11 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-brand/50 focus:ring-1 focus:ring-emerald-brand/30 transition-colors tracking-widest"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg font-semibold text-sm bg-emerald-brand text-primary-foreground hover:opacity-90 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            style={{ background: "hsl(var(--emerald))" }}
          >
            {loading ? "Authenticating…" : "Enter Workspace"}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-surface-3 text-center">
          <p className="text-xs text-muted-foreground">
            Are you the account owner?{" "}
            <a href="/boss-login" className="text-emerald-brand hover:underline font-medium">
              Boss Login →
            </a>
          </p>
        </div>
      </div>

      {/* Footer */}
      <p className="mt-6 text-xs text-muted-foreground/50">
        PayWatch v1.0 · Secure Transaction Monitor
      </p>
    </div>
  );
}
