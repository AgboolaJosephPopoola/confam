import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Zap, Mail, Lock, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function BossLogin() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back, Boss.");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Check your email to verify your account.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left: Branding */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] border-r border-surface-3 p-10 bg-surface-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-dim border border-emerald-brand/30">
            <Zap className="w-5 h-5 text-emerald-brand" />
          </div>
          <span className="text-lg font-bold tracking-tight">PayWatch</span>
        </div>

        <div className="space-y-6">
          <div>
            <p className="text-4xl font-bold text-foreground leading-tight">
              Your payments.<br />
              <span className="text-emerald-brand">Always watching.</span>
            </p>
            <p className="mt-4 text-muted-foreground text-sm leading-relaxed">
              Real-time transaction monitoring for modern businesses. Know the moment money moves.
            </p>
          </div>

          <div className="space-y-3">
            {["Real-time Gmail monitoring", "Staff kiosk access control", "Instant gong alerts"].map((f) => (
              <div key={f} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-brand flex-shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground/40">
          © 2026 PayWatch · Enterprise Edition
        </p>
      </div>

      {/* Right: Form */}
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-dim border border-emerald-brand/30">
              <Zap className="w-4.5 h-4.5 text-emerald-brand" />
            </div>
            <span className="text-base font-bold">PayWatch</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-foreground">
              {mode === "login" ? "Boss Dashboard" : "Create Account"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "login" ? "Sign in to your control panel" : "Set up your company workspace"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="boss@company.com"
                  className="w-full bg-surface-2 border border-surface-3 rounded-lg pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-brand/50 focus:ring-1 focus:ring-emerald-brand/30 transition-colors"
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-surface-2 border border-surface-3 rounded-lg pl-10 pr-11 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-brand/50 focus:ring-1 focus:ring-emerald-brand/30 transition-colors"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg font-semibold text-sm transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              style={{
                background: "hsl(var(--emerald))",
                color: "hsl(var(--primary-foreground))",
              }}
            >
              {loading
                ? "Please wait…"
                : mode === "login"
                ? "Sign In"
                : "Create Account"}
            </button>
          </form>

          <div className="space-y-3 pt-2">
            <div className="text-center">
              <button
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {mode === "login"
                  ? "Don't have an account? Sign up"
                  : "Already have an account? Sign in"}
              </button>
            </div>
            <div className="text-center">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-emerald-brand transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
                Staff kiosk login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
