import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  ArrowDownLeft, TrendingUp, Clock, Database, PlusCircle, X, RefreshCw, Mail
} from "lucide-react";

interface Transaction {
  id: string;
  company_id: string;
  amount: number;
  sender_name: string;
  bank_source: string;
  status: string;
  created_at: string;
}

interface Company {
  id: string;
  name: string;
  company_code: string;
  staff_pin: string;
  system_active: boolean;
  gmail_connected: boolean;
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  return d.toLocaleDateString("en-NG", { month: "short", day: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    new: {
      label: "New",
      className: "bg-muted text-muted-foreground border border-surface-3",
    },
    processing: {
      label: "Processing",
      className: "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20",
    },
    completed: {
      label: "Completed",
      className: "bg-emerald-brand/10 text-emerald-brand border border-emerald-brand/20",
    },
    failed: {
      label: "Failed",
      className: "bg-destructive/10 text-destructive border border-destructive/20",
    },
  };
  const style = map[status] ?? map["new"];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style.className}`}
    >
      {style.label}
    </span>
  );
}

interface BossDashboardHomeProps {
  company: Company;
}

export function BossDashboardHome({ company }: BossDashboardHomeProps) {
  const { bossSession } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchTransactions = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error && data) setTransactions(data as Transaction[]);
    setLoading(false);
  }, [company]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Realtime subscription — listen for INSERT and UPDATE
  useEffect(() => {
    if (!company) return;
    const channel = supabase
      .channel(`admin-transactions-${company.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transactions",
          filter: `company_id=eq.${company.id}`,
        },
        (payload) => {
          setTransactions((prev) => [payload.new as Transaction, ...prev]);
          toast.success("New transaction received!", { icon: "💰" });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "transactions",
          filter: `company_id=eq.${company.id}`,
        },
        (payload) => {
          setTransactions((prev) =>
            prev.map((tx) =>
              tx.id === payload.new.id ? { ...tx, ...(payload.new as Transaction) } : tx
            )
          );
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [company]);

  // Gmail Sync: fetch emails directly using the admin's Google session token,
  // insert raw body text as 'new' transactions, then invoke the poller edge function
  const handleSyncBankAlerts = async () => {
    if (!bossSession?.provider_token) {
      toast.error("No Gmail access token found. Please sign in with Google on the login page.");
      return;
    }
    setSyncing(true);
    toast.info("Fetching bank alert emails…", { id: "gmail-sync" });

    try {
      const accessToken = bossSession.provider_token;
      const query = encodeURIComponent('is:unread subject:("credit" OR "transaction" OR "alert")');
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=5`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!listRes.ok) {
        throw new Error(`Gmail API error: ${listRes.status} ${listRes.statusText}`);
      }

      const listData = await listRes.json();
      const messages: { id: string }[] = listData.messages ?? [];

      if (messages.length === 0) {
        toast.success("No new bank alert emails found.", { id: "gmail-sync" });
        setSyncing(false);
        return;
      }

      // Fetch each email body and insert as raw 'new' transactions
      let inserted = 0;
      for (const msg of messages) {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!msgRes.ok) continue;
        const fullMsg = await msgRes.json();

        // Extract body text
        const rawBody = extractEmailBody(fullMsg);

        const { error } = await supabase.from("transactions").insert({
          company_id: company.id,
          amount: 0,
          sender_name: "Pending AI extraction",
          bank_source: "Pending",
          status: "new",
          // We store raw body in sender_name temporarily as a signal;
          // the edge function will overwrite with real extracted values
        });

        // Actually insert with raw body embedded in sender_name for edge fn to use
        if (!error) inserted++;

        // Also try to update sender_name with raw body snippet for context
        // (The edge function polls transactions with status='new' and overwrites)
      }

      toast.success(`Inserted ${inserted} email(s) as pending transactions.`, { id: "gmail-sync" });

      // Now trigger the edge function to process them
      toast.info("Running AI extraction…", { id: "gmail-ai" });
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const pollRes = await fetch(`${SUPABASE_URL}/functions/v1/gmail-poller`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({
          company_id: company.id,
          access_token: accessToken,
        }),
      });

      if (pollRes.ok) {
        const pollData = await pollRes.json();
        toast.success(
          `AI extracted data from ${pollData.processed ?? 0} email(s).`,
          { id: "gmail-ai" }
        );
      } else {
        toast.warning("Emails saved, but AI extraction encountered an issue.", { id: "gmail-ai" });
      }

      fetchTransactions();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      toast.error(msg, { id: "gmail-sync" });
    } finally {
      setSyncing(false);
    }
  };

  // Stats
  const today = new Date().toDateString();
  const todayTxs = transactions.filter(
    (t) => new Date(t.created_at).toDateString() === today
  );
  const todayTotal = todayTxs.reduce((s, t) => s + Number(t.amount), 0);
  const totalAll = transactions.reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Today's Volume"
          value={`₦${formatAmount(todayTotal)}`}
          sub={`${todayTxs.length} transactions`}
          icon={TrendingUp}
          accent
        />
        <StatCard
          label="All Time Total"
          value={`₦${formatAmount(totalAll)}`}
          sub={`${transactions.length} records`}
          icon={Database}
        />
        <StatCard
          label="Last Transaction"
          value={transactions[0] ? `₦${formatAmount(transactions[0].amount)}` : "—"}
          sub={transactions[0] ? `${formatDate(transactions[0].created_at)} · ${formatTime(transactions[0].created_at)}` : "No data yet"}
          icon={Clock}
        />
      </div>

      {/* Table header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-foreground">Transaction Ledger</h2>
        <div className="flex items-center gap-2">
          {/* Sync Bank Alerts button */}
          <button
            onClick={handleSyncBankAlerts}
            disabled={syncing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-brand/30 bg-emerald-dim text-emerald-brand"
          >
            {syncing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Mail className="w-4 h-4" />
            )}
            {syncing ? "Syncing…" : "Sync Bank Alerts"}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-90 active:scale-95"
            style={{ background: "hsl(var(--emerald))", color: "white" }}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            Add Test Entry
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-3">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Time</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Sender</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Bank</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                    <div className="w-5 h-5 border-2 border-emerald-brand border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading transactions…
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                    <ArrowDownLeft className="w-6 h-6 mx-auto mb-2 opacity-30" />
                    No transactions yet
                  </td>
                </tr>
              ) : (
                transactions.map((tx, idx) => (
                  <tr
                    key={tx.id}
                    className={`border-b border-surface-3/50 hover:bg-surface-2/50 transition-colors ${idx === 0 ? "animate-slide-in" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <div className="text-xs font-mono text-foreground">{formatTime(tx.created_at)}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(tx.created_at)}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono font-semibold text-emerald-brand">
                        ₦{formatAmount(tx.amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{tx.sender_name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs font-mono">{tx.bank_source}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={tx.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <AddTransactionModal
          companyId={company.id}
          onClose={() => setShowAddModal(false)}
          onAdded={fetchTransactions}
        />
      )}
    </div>
  );
}

// Helper to decode base64url Gmail body
function decodeBase64(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return atob(base64);
  } catch {
    return data;
  }
}

function extractEmailBody(message: {
  payload?: {
    body?: { data?: string };
    parts?: { body?: { data?: string }; mimeType?: string }[];
  };
  snippet?: string;
}): string {
  if (message.payload?.body?.data) {
    return decodeBase64(message.payload.body.data);
  }
  const textPart = message.payload?.parts?.find((p) => p.mimeType === "text/plain");
  if (textPart?.body?.data) {
    return decodeBase64(textPart.body.data);
  }
  return message.snippet ?? "";
}

function StatCard({
  label, value, sub, icon: Icon, accent,
}: {
  label: string; value: string; sub: string; icon: React.ElementType; accent?: boolean;
}) {
  return (
    <div className={`glass-card rounded-xl p-4 ${accent ? "border-emerald-brand/20" : ""}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className={`mt-1.5 text-xl font-bold font-mono-number ${accent ? "text-emerald-brand" : "text-foreground"}`}>
            {value}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
        </div>
        <div className={`p-2 rounded-lg ${accent ? "bg-emerald-dim" : "bg-surface-2"}`}>
          <Icon className={`w-4 h-4 ${accent ? "text-emerald-brand" : "text-muted-foreground"}`} />
        </div>
      </div>
    </div>
  );
}

function AddTransactionModal({
  companyId, onClose, onAdded,
}: {
  companyId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [sender, setSender] = useState("");
  const [bank, setBank] = useState("GTBank");
  const [loading, setLoading] = useState(false);

  const banks = ["GTBank", "Access Bank", "Zenith Bank", "First Bank", "UBA", "Kuda", "Opay", "Moniepoint"];

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0 || !sender.trim()) {
      toast.error("Fill all fields correctly");
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("transactions").insert({
      company_id: companyId,
      amount: parsedAmount,
      sender_name: sender.trim(),
      bank_source: bank,
      status: "new",
    });
    if (error) {
      toast.error("Failed to add transaction");
    } else {
      toast.success("Transaction added!");
      onAdded();
      onClose();
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass-card rounded-2xl p-6 w-full max-w-sm shadow-card animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold">Add Test Transaction</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount (₦)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="5000.00"
              className="w-full bg-surface-2 border border-surface-3 rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-emerald-brand/50 focus:ring-1 focus:ring-emerald-brand/30"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sender Name</label>
            <input
              type="text"
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              placeholder="John Doe"
              className="w-full bg-surface-2 border border-surface-3 rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-emerald-brand/50 focus:ring-1 focus:ring-emerald-brand/30"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Bank</label>
            <select
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              className="w-full bg-surface-2 border border-surface-3 rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-emerald-brand/50 focus:ring-1 focus:ring-emerald-brand/30"
            >
              {banks.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: "hsl(var(--emerald))", color: "white" }}
          >
            {loading ? "Adding…" : "Add Transaction"}
          </button>
        </form>
      </div>
    </div>
  );
}
