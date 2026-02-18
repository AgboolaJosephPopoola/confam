import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { LogOut, Wifi, WifiOff, Zap } from "lucide-react";

interface Transaction {
  id: string;
  company_id: string;
  amount: number;
  sender_name: string;
  bank_source: string;
  status: string;
  created_at: string;
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
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

export function StaffGongView() {
  const { staffSession, signOut } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const audioRef = useRef<AudioContext | null>(null);

  const playGong = useCallback(() => {
    try {
      if (!audioRef.current) {
        audioRef.current = new AudioContext();
      }
      const ctx = audioRef.current;
      // Synthesize a cash-register-like sound
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

      // Second ding
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
          // Only show if within last 24 hours
          if (Date.now() - new Date(newTx.created_at).getTime() < 86400000) {
            setTransactions((prev) => [newTx, ...prev]);
            setNewIds((prev) => new Set(prev).add(newTx.id));
            playGong();
            toast.success("💰 New Payment Received!", {
              description: `₦${formatAmount(newTx.amount)} from ${newTx.sender_name}`,
              duration: 5000,
            });
            // Remove new highlight after animation
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

  if (!staffSession) return null;

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
                <span className="text-xs text-emerald-brand font-medium">Live Monitor</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
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

      {/* Amount — the hero element */}
      <div className="amount-display mb-2">
        ₦{formatAmount(tx.amount)}
      </div>

      {/* Sender */}
      <p className="text-base font-semibold text-foreground leading-tight">{tx.sender_name}</p>

      {/* Meta row */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-3/50">
        <span className="text-xs font-mono text-muted-foreground">{tx.bank_source}</span>
        <span className="text-xs text-muted-foreground">{timeAgo(tx.created_at)}</span>
      </div>
    </div>
  );
}
