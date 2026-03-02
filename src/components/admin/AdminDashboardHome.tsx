import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

import { toast } from "sonner";
import {
  ArrowDownLeft, TrendingUp, Clock, Database, PlusCircle, X, Pencil,
} from "lucide-react";

interface Transaction {
  id: string;
  company_id: string;
  amount: number;
  sender_name: string;
  bank_source: string;
  item_description?: string;
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
  connected_banks?: string[];
}

interface BankRecord {
  name: string;
  slug: string;
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
  const map: Record<string, { label: string; className: string; pulse?: boolean }> = {
    new: {
      label: "New",
      className: "bg-muted text-muted-foreground border border-surface-3",
      pulse: true,
    },
    processing: {
      label: "Processing",
      className: "bg-yellow-500/10 text-yellow-500 border border-yellow-500/30",
    },
    completed: {
      label: "Completed",
      className: "bg-emerald-dim text-emerald-brand border border-emerald-brand/30",
    },
    failed: {
      label: "Failed",
      className: "bg-destructive/10 text-destructive border border-destructive/20",
    },
  };
  const style = map[status] ?? map["new"];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${style.className}`}
    >
      {style.pulse && (
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-pulse inline-block" />
      )}
      {style.label}
    </span>
  );
}

interface AdminDashboardHomeProps {
  company: Company;
}

export function AdminDashboardHome({ company }: AdminDashboardHomeProps) {
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  
  const [bankFilter, setBankFilter] = useState<string>("all");
  const [connectedBankNames, setConnectedBankNames] = useState<BankRecord[]>([]);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  // Fetch bank names for connected_banks slugs
  useEffect(() => {
    if (!company.connected_banks?.length) {
      setConnectedBankNames([]);
      return;
    }
    const fetchBankNames = async () => {
      const { data } = await supabase
        .from("banks")
        .select("name, slug")
        .in("slug", company.connected_banks!);
      if (data) setConnectedBankNames(data as BankRecord[]);
    };
    fetchBankNames();
  }, [company.connected_banks]);

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

  // Realtime subscription
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
          try {
            const audio = new Audio('/sounds/kaching.mp3');
            audio.volume = 1.0;
            audio.play().catch(() => {});
          } catch (e) {}
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

  const today = new Date().toDateString();
  const todayTxs = transactions.filter(
    (t) => new Date(t.created_at).toDateString() === today
  );
  const todayTotal = todayTxs.reduce((s, t) => s + Number(t.amount), 0);
  const totalAll = transactions.reduce((s, t) => s + Number(t.amount), 0);

  // Filter transactions by bank
  const filteredTransactions = bankFilter === "all"
    ? transactions
    : transactions.filter((tx) => {
        const src = tx.bank_source.toLowerCase().replace(/\s+/g, "-");
        return src === bankFilter || tx.bank_source.toLowerCase().replace(/\s+/g, "") === bankFilter.replace(/-/g, "");
      });

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
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-90 active:scale-95 text-primary-foreground"
            style={{ background: "hsl(var(--emerald))" }}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            Add Test Entry
          </button>
        </div>
      </div>

      {/* Bank filter — only show verified connected banks */}
      {connectedBankNames.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setBankFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              bankFilter === "all"
                ? "bg-emerald-dim text-emerald-brand border border-emerald-brand/40"
                : "bg-surface-2 text-muted-foreground border border-surface-3 hover:text-foreground"
            }`}
          >
            All Banks
          </button>
          {connectedBankNames.map((bank) => (
            <button
              key={bank.slug}
              onClick={() => setBankFilter(bank.slug)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                bankFilter === bank.slug
                  ? "bg-emerald-dim text-emerald-brand border border-emerald-brand/40"
                  : "bg-surface-2 text-muted-foreground border border-surface-3 hover:text-foreground"
              }`}
            >
              {bank.name}
            </button>
          ))}
        </div>
      )}

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
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Item</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                    <div className="w-5 h-5 border-2 border-emerald-brand border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading transactions…
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                    <ArrowDownLeft className="w-6 h-6 mx-auto mb-2 opacity-30" />
                    No transactions {bankFilter !== "all" ? "for this bank" : "yet"}
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx, idx) => (
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
                    <td className="px-4 py-3 text-foreground">{tx.item_description ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={tx.status} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setEditingTx(tx)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                        title="Edit transaction"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
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

      {editingTx && (
        <EditTransactionModal
          transaction={editingTx}
          onClose={() => setEditingTx(null)}
          onSaved={fetchTransactions}
        />
      )}
    </div>
  );
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
      status: "completed",
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
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 text-primary-foreground"
            style={{ background: "hsl(var(--emerald))" }}
          >
            {loading ? "Adding…" : "Add Transaction"}
          </button>
        </form>
      </div>
    </div>
  );
}

function EditTransactionModal({
  transaction, onClose, onSaved,
}: {
  transaction: Transaction;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(transaction.amount));
  const [sender, setSender] = useState(transaction.sender_name);
  const [bankSource, setBankSource] = useState(transaction.bank_source);
  const [loading, setLoading] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0 || !sender.trim() || !bankSource.trim()) {
      toast.error("Fill all fields correctly");
      return;
    }
    setLoading(true);
    const { error } = await supabase
      .from("transactions")
      .update({
        amount: parsedAmount,
        sender_name: sender.trim(),
        bank_source: bankSource.trim(),
      })
      .eq("id", transaction.id);

    if (error) {
      toast.error("Failed to update transaction");
    } else {
      toast.success("Transaction updated ✓");
      onSaved();
      onClose();
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass-card rounded-2xl p-6 w-full max-w-sm shadow-card animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold">Edit Transaction</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount (₦)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-surface-2 border border-surface-3 rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-emerald-brand/50 focus:ring-1 focus:ring-emerald-brand/30"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sender Name</label>
            <input
              type="text"
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              className="w-full bg-surface-2 border border-surface-3 rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-emerald-brand/50 focus:ring-1 focus:ring-emerald-brand/30"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Bank Source</label>
            <input
              type="text"
              value={bankSource}
              onChange={(e) => setBankSource(e.target.value)}
              className="w-full bg-surface-2 border border-surface-3 rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-emerald-brand/50 focus:ring-1 focus:ring-emerald-brand/30"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 text-primary-foreground"
            style={{ background: "hsl(var(--emerald))" }}
          >
            {loading ? "Saving…" : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
