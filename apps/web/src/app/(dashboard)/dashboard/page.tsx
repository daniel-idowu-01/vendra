"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Mic, Phone, Plus, Send, Unlink } from "lucide-react";
import { useDashboard, useDebtSummary, useLowStock } from "@/lib/hooks/use-dashboard";
import { useProducts, useBranches, useRecordTransaction } from "@/lib/hooks/use-inventory";
import { useAuthStore } from "@/lib/auth-store";
import { apiFetch } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: dash, isLoading: dashLoading } = useDashboard();
  const { data: debtSummary } = useDebtSummary();
  const { data: lowStock } = useLowStock();
  const { data: products } = useProducts(1, 100);
  const { data: branches } = useBranches();
  const recordSale = useRecordTransaction();
  const orgId = useAuthStore((s) => s.organizationId);
  const { data: whatsAppLink, isLoading: whatsAppLinkLoading } = useQuery({
    queryKey: ["auth", "whatsapp-link"],
    queryFn: () => apiFetch<{ linked: boolean; phone: string | null }>("/auth/whatsapp-link")
  });

  const [linkPhone, setLinkPhone] = useState("");
  const [linkError, setLinkError] = useState("");
  const linkWhatsApp = useMutation({
    mutationFn: (phone: string) =>
      apiFetch<{ linked: boolean; phone: string }>("/auth/link-whatsapp", {
        method: "POST",
        body: JSON.stringify({ phone })
      }),
    onSuccess: async () => {
      setLinkPhone("");
      await queryClient.invalidateQueries({ queryKey: ["auth", "whatsapp-link"] });
    }
  });
  const unlinkWhatsApp = useMutation({
    mutationFn: () =>
      apiFetch<{ linked: boolean; phone: string | null }>("/auth/whatsapp-link", {
        method: "DELETE"
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "whatsapp-link"] });
    }
  });

  const handleLinkWhatsApp = async () => {
    if (!linkPhone) return;
    setLinkError("");
    try {
      await linkWhatsApp.mutateAsync(linkPhone);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Failed to link phone");
    }
  };

  const handleUnlinkWhatsApp = async () => {
    setLinkError("");
    try {
      await unlinkWhatsApp.mutateAsync();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Failed to unlink phone");
    }
  };

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
          <select className="input-surface w-full" value={saleProduct} onChange={(e) => setSaleProduct(e.target.value)}>
            <option value="" disabled>Select product</option>
            {(products?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.quantity} in stock)</option>
            ))}
          </select>
          <select className="input-surface w-full" value={saleBranch} onChange={(e) => setSaleBranch(e.target.value)}>
            <option value="" disabled>Select branch</option>
            {(branches ?? []).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
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
            {dashLoading ? "..." : formatCurrency(totalSales)}
          </p>
        </Card>
        <Card className="animate-fade-up">
          <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Open debt</p>
          <p className="mt-3 text-3xl font-semibold">
            {dashLoading ? "..." : formatCurrency(openDebt)}
          </p>
        </Card>
      </div>

      <Card className="animate-fade-up">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15">
            <Phone className="h-5 w-5 text-accent" />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <p className="font-semibold text-foreground">Link your WhatsApp number</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect your phone number so the system recognises you when you send a message via WhatsApp.
              </p>
            </div>
            {whatsAppLinkLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking WhatsApp link...
              </div>
            ) : whatsAppLink?.linked ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <Check className="h-4 w-4" />
                  <span>{whatsAppLink.phone} is linked.</span>
                </div>
                <Button variant="secondary" onClick={handleUnlinkWhatsApp} disabled={unlinkWhatsApp.isPending}>
                  {unlinkWhatsApp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                  Unlink
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  className="input-surface flex-1"
                  placeholder="+2348123456789"
                  value={linkPhone}
                  onChange={(e) => setLinkPhone(e.target.value)}
                />
                <Button onClick={handleLinkWhatsApp} disabled={linkWhatsApp.isPending || !linkPhone}>
                  {linkWhatsApp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Link
                </Button>
              </div>
            )}
            {linkError && <p className="text-sm text-red-400">{linkError}</p>}
          </div>
        </div>
      </Card>
    </div>
  );
}
