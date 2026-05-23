"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mic, Plus, Send, Loader2 } from "lucide-react";
import { useDashboard, useDebtSummary, useLowStock } from "@/lib/hooks/use-dashboard";
import { useRecordTransaction } from "@/lib/hooks/use-inventory";
import { useAuthStore } from "@/lib/auth-store";

export default function DashboardPage() {
  const router = useRouter();
  const { data: dash, isLoading: dashLoading } = useDashboard();
  const { data: debtSummary } = useDebtSummary();
  const { data: lowStock } = useLowStock();
  const recordSale = useRecordTransaction();
  const orgId = useAuthStore((s) => s.organizationId);

  const [showQuickSale, setShowQuickSale] = useState(false);
  const [saleProduct, setSaleProduct] = useState("");
  const [saleQty, setSaleQty] = useState(1);
  const [saleBranch, setSaleBranch] = useState("");

  const totalSales = dash?.todaySales ?? 0;
  const openDebt = dash?.openDebt ?? debtSummary?.outstanding ?? 0;
  const lowStockCount = dash?.lowStockCount ?? lowStock?.length ?? 0;
  const insights = dash?.insights ?? [];

  const handleQuickSale = async () => {
    if (!saleProduct || !saleBranch) return;
    await recordSale.mutateAsync({
      productId: saleProduct,
      branchId: saleBranch,
      type: "SALE",
      quantity: saleQty
    });
    setShowQuickSale(false);
    setSaleProduct("");
    setSaleQty(1);
  };

  return (
    <div className="space-y-5 pb-10">
      <section className="glass-panel overflow-hidden px-6 py-7 animate-fade-up">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.32em] text-muted-foreground">Today</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-foreground">
              {dashLoading ? "Loading..." : "Your business assistant is ready."}
            </h1>
          </div>
          <span className="rounded-full bg-accent/15 px-3 py-1 text-sm font-semibold text-accent">Live</span>
        </div>
        <p className="max-w-xl text-sm leading-7 text-muted-foreground">
          {insights.length > 0 ? insights[0] : "Check stock, create invoices and follow up debtors from WhatsApp or this dashboard with one polished workflow."}
        </p>
      </section>

      <div className="grid grid-cols-3 gap-3 animate-fade-up">
        <Button onClick={() => setShowQuickSale(true)} className="w-full flex-col gap-2 px-3 text-sm">
          <Plus className="h-4 w-4" /> Sale
        </Button>
        <Button variant="secondary" onClick={() => router.push("/invoices")} className="w-full flex-col gap-2 px-3 text-sm">
          <Send className="h-4 w-4" /> Invoice
        </Button>
        <Button variant="secondary" onClick={() => alert("Voice input is not yet available on desktop. Use WhatsApp to interact with your assistant.")} className="w-full flex-col gap-2 px-3 text-sm">
          <Mic className="h-4 w-4" /> Voice
        </Button>
      </div>

      {showQuickSale && (
        <Card className="animate-fade-up space-y-4">
          <p className="text-sm font-semibold">Quick Sale</p>
          <input className="input-surface w-full" placeholder="Product ID" value={saleProduct} onChange={(e) => setSaleProduct(e.target.value)} />
          <input className="input-surface w-full" placeholder="Branch ID" value={saleBranch} onChange={(e) => setSaleBranch(e.target.value)} />
          <input className="input-surface w-full" type="number" min={1} value={saleQty} onChange={(e) => setSaleQty(Number(e.target.value))} />
          <div className="flex gap-2">
            <Button onClick={handleQuickSale} disabled={recordSale.isPending} className="flex-1">
              {recordSale.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Record Sale
            </Button>
            <Button variant="ghost" onClick={() => setShowQuickSale(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      <Card className="animate-fade-up">
        <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Insights</p>
        <p className="mt-3 text-lg font-semibold text-foreground">
          {dashLoading
            ? "Loading insights..."
            : insights.length > 0
              ? insights.join(" ")
              : lowStockCount > 0
                ? `${lowStockCount} products need restocking${openDebt > 0 ? ` and ${debtSummary?.count ?? 0} customers have overdue balances.` : "."}`
                : "All stock levels are healthy and no overdue debts."}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="animate-fade-up">
          <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Today&rsquo;s sales</p>
          <p className="mt-3 text-3xl font-semibold">
            {dashLoading ? "..." : `\u20A6${totalSales.toLocaleString()}`}
          </p>
        </Card>
        <Card className="animate-fade-up">
          <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Open debt</p>
          <p className="mt-3 text-3xl font-semibold">
            {dashLoading ? "..." : `\u20A6${openDebt.toLocaleString()}`}
          </p>
        </Card>
      </div>
    </div>
  );
}
