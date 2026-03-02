import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { LogOut, Wifi, WifiOff, Zap, Sun, Moon, X } from "lucide-react";

interface Transaction {
  id: string;
  company_id: string;
  amount: number;
  sender_name: string;
  bank_source: string;
  status: string;
  created_at: string;
}

interface BankRecord {
  name: string;
  slug: string;
  logo_local_url: string | null;
  logo_dev_url: string | null;
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-NG", { month: "short", day: "numeric" });
}

function formatTime12(iso: string) {
  return new Date(iso).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", hour12: true });
}

function BankLogoSmall({ bankSource, banks }: { bankSource: string; banks: BankRecord[] }) {
  const [localFailed, setLocalFailed] = useState(false);
  const [devFailed, setDevFailed] = useState(false);

  const slug = bankSource.toLowerCase().replace(/\s+/g, "-");
  const bank = banks.find((b) => b.slug === slug || b.name.toLowerCase() === bankSource.toLowerCase());

  if (bank?.logo_local_url && !localFailed) {
    return (
      <img
        src={bank.logo_local_url}
        alt={bankSource}
        className="w-8 h-8 rounded-lg object-contain"
        onError={() => setLocalFailed(true)}
      />
    );
  }
  if (bank?.logo_dev_url && !devFailed) {
    return (
      <img
        src={bank.logo_dev_url}
        alt={bankSource}
        className="w-8 h-8 rounded-lg object-contain"
        onError={() => setDevFailed(true)}
      />
    );
  }
  return (
    <div className="w-8 h-8 rounded-lg bg-emerald-dim flex items-center justify-center text-xs font-bold text-emerald-brand">
      {bankSource.charAt(0).toUpperCase()}
    </div>
  );
}

export function StaffGongView() {
  const { staffSession, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const audioRef = useRef<AudioContext | null>(null);
  const [pendingTx, setPendingTx] = useState<Transaction | null>(null);
  const [itemSold, setItemSold] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [banks, setBanks] = useState<BankRecord[]>([]);

  // Fetch banks for logo resolution
  useEffect(() => {
    supabase.from("banks").select("name, slug, logo_local_url, logo_dev_url").then(({ data }) => {
      if (data) setBanks(data as BankRecord[]);
    });
  }, []);

  const playGong = useCallback(() => {
    try {
      if (!audioRef.current) {
        audioRef.current = new AudioContext();
      }
      const ctx = audioRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.8);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.15);
      osc2.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.5);
      gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
      osc2.start(ctx.currentTime + 0.15);
      osc2.stop(ctx.currentTime + 0.9);
    } catch (e) {
      console.warn("Audio playback failed:", e);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    if (!staffSession) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("get_staff_transactions", {
      p_company_id: staffSession.companyId,
      p_company_code: staffSession.companyCode,
      p_staff_pin: staffSession.staffPin,
    });
    if (!error && data) {
      setTransactions(data as Transaction[]);
    }
    setLoading(false);
  }, [staffSession]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Realtime
  useEffect(() => {
    if (!staffSession) return;
    const channel = supabase
      .channel(`staff-gong-${staffSession.companyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transactions",
          filter: `company_id=eq.${staffSession.companyId}`,
        },
        (payload) => {
          const newTx = payload.new as Transaction;
          if (Date.now() - new Date(newTx.created_at).getTime() < 86400000) {
            setTransactions((prev) => [newTx, ...prev]);
            setNewIds((prev) => new Set(prev).add(newTx.id));
            playGong();
            toast.success("💰 New Payment Received!", {
              description: `₦${formatAmount(newTx.amount)} from ${newTx.sender_name}`,
              duration: 5000,
            });
            // Show sale confirmation popup
            setPendingTx(newTx);
            setItemSold("");
            setTimeout(() => {
              setNewIds((prev) => {
                const next = new Set(prev);
                next.delete(newTx.id);
                return next;
              });
            }, 3000);
          }
        }
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => { supabase.removeChannel(channel); };
  }, [staffSession, playGong]);

  const handleConfirmSale = async () => {
    if (!pendingTx || !staffSession) return;
    setConfirming(true);
    const { error } = await supabase
      .from("transactions")
      .update({
        item_description: itemSold.trim() || null,
        acknowledged_at: new Date().toISOString(),
        staff_id: staffSession.staffId || null,
      })
      .eq("id", pendingTx.id);
    if (error) {
      toast.error("Failed to confirm sale");
    } else {
      toast.success("Sale confirmed ✓");
    }
    setConfirming(false);
    setPendingTx(null);
    setItemSold("");
  };

  const handleDismiss = () => {
    setPendingTx(null);
    setItemSold("");
  };

  if (!staffSession) return null;

  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <div className="flex flex-col min-h-screen bg-background max-w-md mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-surface-3 bg-surface-1/90 backdrop-blur-sm px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-dim border border-emerald-brand/30">
              <Zap className="w-4 h-4 text-emerald-brand" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground leading-tight">
                {staffSession.companyName}
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="pulse-dot">
                  <span className="before:bg-emerald-brand after:bg-emerald-bright" />
                </span>
                <span className="text-xs text-emerald-brand font-medium">
                  {staffSession.staffName ? `${staffSession.staffName} · Live` : "Live Monitor"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
              title="Toggle theme"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            {connected ? (
              <Wifi className="w-4 h-4 text-emerald-brand" />
            ) : (
              <WifiOff className="w-4 h-4 text-muted-foreground" />
            )}
            <button
              onClick={signOut}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
              title="Exit"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Today's mini-stat */}
        <div className="mt-3 flex gap-3">
          <div className="flex-1 bg-surface-2 rounded-lg px-3 py-2 border border-surface-3">
            <p className="text-xs text-muted-foreground">Today's Inflow</p>
            <p className="text-sm font-bold text-emerald-brand font-mono-number">
              ₦{formatAmount(transactions.reduce((s, t) => s + Number(t.amount), 0))}
            </p>
          </div>
          <div className="flex-1 bg-surface-2 rounded-lg px-3 py-2 border border-surface-3">
            <p className="text-xs text-muted-foreground">Transactions</p>
            <p className="text-sm font-bold text-foreground">{transactions.length}</p>
          </div>
        </div>
      </header>

      {/* Feed */}
      <main className="flex-1 px-4 py-4 space-y-3 pb-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="w-6 h-6 border-2 border-emerald-brand border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading feed…</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-dim border border-emerald-brand/20 flex items-center justify-center">
              <Zap className="w-6 h-6 text-emerald-brand opacity-40" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Waiting for payments</p>
              <p className="text-xs text-muted-foreground mt-1">New transactions will appear here in real-time</p>
            </div>
          </div>
        ) : (
          transactions.map((tx, idx) => (
            <GongCard
              key={tx.id}
              tx={tx}
              isNew={newIds.has(tx.id)}
              isFirst={idx === 0}
            />
          ))
        )}
      </main>

      {/* Sale Confirmation Modal */}
      {pendingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-card rounded-2xl p-6 w-full max-w-sm shadow-card animate-fade-in space-y-5">
            {/* Amount */}
            <div className="text-center">
              <p className="text-3xl font-bold text-emerald-brand font-mono-number">
                ₦{formatAmount(pendingTx.amount)}
              </p>
              <p className="text-base font-semibold text-foreground mt-2">{pendingTx.sender_name}</p>
            </div>

            {/* Bank + Time */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-surface-3">
              <div className="flex items-center gap-2">
                <BankLogoSmall bankSource={pendingTx.bank_source} banks={banks} />
                <span className="text-sm text-foreground">{pendingTx.bank_source}</span>
              </div>
              <span className="text-xs text-muted-foreground">{formatTime12(pendingTx.created_at)}</span>
            </div>

            {/* Staff name (read-only) */}
            {staffSession?.staffName && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Staff</label>
                <div className="w-full bg-surface-2 border border-surface-3 rounded-lg px-4 py-2.5 text-sm text-foreground">
                  {staffSession.staffName}
                </div>
              </div>
            )}

            {/* Item sold input */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Item Sold</label>
              <input
                type="text"
                value={itemSold}
                onChange={(e) => setItemSold(e.target.value)}
                placeholder="e.g. 3 yards of fabric"
                className="w-full bg-surface-2 border border-surface-3 rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-brand/50 focus:ring-1 focus:ring-emerald-brand/30"
                autoFocus
              />
            </div>

            {/* Confirm button */}
            <button
              onClick={handleConfirmSale}
              disabled={confirming}
              className="w-full py-3 rounded-lg font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 text-primary-foreground"
              style={{ background: "hsl(var(--emerald))" }}
            >
              {confirming ? "Confirming…" : "Confirm Sale"}
            </button>

            {/* Dismiss link */}
            <div className="text-center">
              <button
                onClick={handleDismiss}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GongCard({
  tx, isNew, isFirst,
}: {
  tx: Transaction; isNew: boolean; isFirst: boolean;
}) {
  return (
    <div
      className={`tx-card ${isNew ? "border-emerald-brand/40 animate-glow-pulse animate-slide-in" : ""}`}
      style={isNew ? { borderColor: "hsl(var(--emerald) / 0.4)" } : undefined}
    >
      {isNew && (
        <div className="flex items-center gap-1.5 mb-3">
          <span className="pulse-dot">
            <span className="before:bg-emerald-brand after:bg-emerald-bright" />
          </span>
          <span className="text-xs text-emerald-brand font-semibold uppercase tracking-widest">
            New Payment
          </span>
        </div>
      )}

      <div className="amount-display mb-2">
        ₦{formatAmount(tx.amount)}
      </div>

      <p className="text-base font-semibold text-foreground leading-tight">{tx.sender_name}</p>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-3/50">
        <span className="text-xs font-mono text-muted-foreground">{tx.bank_source}</span>
        <span className="text-xs text-muted-foreground">{timeAgo(tx.created_at)}</span>
      </div>
    </div>
  );
}
