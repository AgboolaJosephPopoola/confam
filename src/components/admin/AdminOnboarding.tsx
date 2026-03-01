import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Zap, Check, Building2, ChevronRight, Mail, SkipForward } from "lucide-react";

interface BankRecord {
  id: string;
  name: string;
  slug: string;
  logo_local_url: string | null;
  logo_dev_url: string | null;
}

function generateCode(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  let initials: string;
  if (words.length >= 3) {
    initials = words.slice(0, 3).map((w) => w[0].toUpperCase()).join("");
  } else if (words.length === 2) {
    initials = words.map((w) => w[0].toUpperCase()).join("") + words[1][1]?.toUpperCase() || "X";
  } else {
    initials = words[0].slice(0, 3).toUpperCase();
  }
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${initials}-${digits}`;
}

function BankLogo({ bank }: { bank: BankRecord }) {
  const [localFailed, setLocalFailed] = useState(false);
  const [devFailed, setDevFailed] = useState(false);

  if (bank.logo_local_url && !localFailed) {
    return (
      <img src={bank.logo_local_url} alt={bank.name}
        className="w-8 h-8 rounded-lg flex-shrink-0 object-contain"
        onError={() => setLocalFailed(true)} />
    );
  }
  if (bank.logo_dev_url && !devFailed) {
    return (
      <img src={bank.logo_dev_url} alt={bank.name}
        className="w-8 h-8 rounded-lg flex-shrink-0 object-contain"
        onError={() => setDevFailed(true)} />
    );
  }
  return (
    <div className="w-8 h-8 rounded-lg bg-emerald-dim flex items-center justify-center text-xs font-bold text-emerald-brand flex-shrink-0">
      {bank.name.charAt(0).toUpperCase()}
    </div>
  );
}

interface AdminOnboardingProps {
  onComplete: () => void;
}

export function AdminOnboarding({ onComplete }: AdminOnboardingProps) {
  const { bossUser } = useAuth();
  const [step, setStep] = useState(1);

  // Step 1
  const [companyName, setCompanyName] = useState("");
  const [companyCode, setCompanyCode] = useState("");

  // Step 2
  const [banks, setBanks] = useState<BankRecord[]>([]);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);

  // Step 3
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("banks")
      .select("id, name, slug, logo_local_url, logo_dev_url")
      .order("tier", { ascending: true })
      .order("name", { ascending: true })
      .then(({ data }) => {
        if (data) setBanks(data as BankRecord[]);
      });
  }, []);

  const handleNameChange = (val: string) => {
    setCompanyName(val);
    if (val.trim().length >= 2) {
      setCompanyCode(generateCode(val));
    }
  };

  const toggleBank = (slug: string) => {
    setSelectedSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };

  const handleGmailConnect = async () => {
    // Save company first, then trigger OAuth
    await saveCompany();
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

  const saveCompany = async () => {
    if (!bossUser) return;
    setSaving(true);
    const { error } = await supabase.from("companies").insert({
      name: companyName.trim(),
      company_code: companyCode.trim().toUpperCase(),
      staff_pin: String(Math.floor(1000 + Math.random() * 9000)),
      owner_id: bossUser.id,
      connected_banks: selectedSlugs,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("unique") ? "That company code is already taken." : "Failed to create company");
      return false;
    }
    return true;
  };

  const handleSkipGmail = async () => {
    const ok = await saveCompany();
    if (ok !== false) {
      toast.success("Company created! Welcome to Confam Pay.");
      onComplete();
    }
  };

  const canProceedStep1 = companyName.trim().length >= 2 && companyCode.trim().length >= 3;
  const canProceedStep2 = selectedSlugs.length >= 1;

  return (
    <div className="flex min-h-screen bg-background items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-8 animate-fade-in">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-dim border border-emerald-brand/30 mx-auto">
            <Zap className="w-6 h-6 text-emerald-brand" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Welcome to Confam Pay</h1>
            <p className="text-sm text-muted-foreground mt-1">Let's set up your workspace in 3 quick steps</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Step {step} of 3</span>
            <span>{step === 1 ? "Company Setup" : step === 2 ? "Select Banks" : "Connect Gmail"}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${(step / 3) * 100}%`,
                background: "hsl(var(--emerald))",
              }}
            />
          </div>
        </div>

        {/* Step content */}
        <div className="glass-card rounded-2xl p-6 space-y-5">
          {step === 1 && (
            <>
              <div>
                <h2 className="text-base font-semibold text-foreground">Company Setup</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Enter your business name. We'll generate a unique company code for staff kiosk access.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. RVT Tech Store"
                    className="w-full bg-surface-2 border border-surface-3 rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-brand/50 focus:ring-1 focus:ring-emerald-brand/30 transition-colors"
                    autoFocus
                  />
                </div>

                {companyCode && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Company Code
                    </label>
                    <input
                      type="text"
                      value={companyCode}
                      onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                      className="w-full bg-surface-2 border border-surface-3 rounded-lg px-4 py-3 text-sm font-mono text-foreground focus:outline-none focus:border-emerald-brand/50 focus:ring-1 focus:ring-emerald-brand/30 transition-colors uppercase tracking-widest"
                    />
                    <p className="text-xs text-muted-foreground">
                      Staff will enter this code on the kiosk. You can edit it.
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!canProceedStep1}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] text-primary-foreground"
                style={{ background: "hsl(var(--emerald))" }}
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <h2 className="text-base font-semibold text-foreground">Select Your Banks</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Choose the banks you receive payment alerts from. Select at least one.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[340px] overflow-y-auto pr-1">
                {banks.map((bank) => {
                  const isSelected = selectedSlugs.includes(bank.slug);
                  return (
                    <button
                      key={bank.id}
                      onClick={() => toggleBank(bank.slug)}
                      className={`relative flex items-center gap-2.5 p-3 rounded-xl border text-left text-sm font-medium transition-all ${
                        isSelected
                          ? "border-emerald-brand/60 bg-emerald-dim"
                          : "border-surface-3 bg-surface-2 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <BankLogo bank={bank} />
                      <span className={`truncate text-xs ${isSelected ? "text-emerald-brand" : ""}`}>
                        {bank.name}
                      </span>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-emerald-brand absolute top-1.5 right-1.5" />
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground/50">Bank logos provided by Logo.dev</p>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-3 rounded-lg text-sm font-medium border border-surface-3 bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!canProceedStep2}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] text-primary-foreground"
                  style={{ background: "hsl(var(--emerald))" }}
                >
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <h2 className="text-base font-semibold text-foreground">Connect Gmail</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Connect your Gmail to auto-import bank payment alerts. You can also do this later in Settings.
                </p>
              </div>

              <div className="flex flex-col items-center gap-4 py-6">
                <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-surface-3 flex items-center justify-center">
                  <Mail className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground text-center max-w-xs">
                  We'll read your bank alert emails and extract transaction data automatically using AI.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleGmailConnect}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 active:scale-[0.98] text-primary-foreground"
                  style={{ background: "hsl(var(--emerald))" }}
                >
                  <Mail className="w-4 h-4" />
                  {saving ? "Saving…" : "Connect Gmail & Finish"}
                </button>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setStep(2)}
                    className="px-4 py-3 rounded-lg text-sm font-medium border border-surface-3 bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSkipGmail}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium border border-surface-3 bg-surface-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    <SkipForward className="w-4 h-4" />
                    {saving ? "Saving…" : "Skip for now"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
