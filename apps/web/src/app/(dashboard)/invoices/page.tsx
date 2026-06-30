"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Loader2, Send, Trash2 } from "lucide-react";
import { useInvoices, useCreateInvoice } from "@/lib/hooks/use-invoices";
import { useCustomers } from "@/lib/hooks/use-customers";
import { formatCurrency } from "@/lib/format";

type DraftItem = { name: string; quantity: number; unitPrice: string };

const emptyItem = (): DraftItem => ({ name: "", quantity: 1, unitPrice: "" });

export default function InvoicesPage() {
  const { data: invoices, isLoading } = useInvoices();
  const { data: customers } = useCustomers();
  const createInvoice = useCreateInvoice();

  const [showCreate, setShowCreate] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);

  const invoiceList = invoices ?? [];
  const customerList = customers ?? [];

  const validItems = items.filter((i) => i.name.trim() && Number(i.unitPrice) > 0 && i.quantity > 0);
  const total = validItems.reduce((sum, i) => sum + i.quantity * Number(i.unitPrice), 0);

  const updateItem = (index: number, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };
  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (index: number) =>
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));

  const resetForm = () => {
    setShowCreate(false);
    setCustomerId("");
    setItems([emptyItem()]);
  };

  const handleCreate = async () => {
    if (validItems.length === 0) return;
    await createInvoice.mutateAsync({
      customerId: customerId || undefined,
      items: validItems.map((i) => ({
        name: i.name.trim(),
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice)
      }))
    });
    resetForm();
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Invoices</p>
          <h1 className="text-2xl font-semibold">Get paid</h1>
        </div>
        <Button
          className="h-10 w-10 px-0 text-[#08070a]"
          aria-label="Create invoice"
          onClick={() => setShowCreate((v) => !v)}
        >
          <Plus className="h-5 w-5 shrink-0" strokeWidth={2.5} />
        </Button>
      </header>

      {showCreate && (
        <Card className="space-y-3">
          <p className="text-sm font-semibold">New invoice</p>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Customer (optional)</label>
            <select
              className="input-surface w-full"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">No customer</option>
              {customerList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` (${c.phone})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-xs text-muted-foreground">Items</label>
            {items.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  className="input-surface min-w-0 flex-1"
                  placeholder="Item name"
                  value={item.name}
                  onChange={(e) => updateItem(index, { name: e.target.value })}
                />
                <input
                  className="input-surface w-16"
                  type="number"
                  min={1}
                  placeholder="Qty"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                />
                <input
                  className="input-surface w-24"
                  type="number"
                  min={0}
                  placeholder="Price"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(index, { unitPrice: e.target.value })}
                />
                <button
                  type="button"
                  aria-label="Remove item"
                  onClick={() => removeItem(index)}
                  disabled={items.length === 1}
                  className="shrink-0 rounded-lg p-2 text-muted-foreground transition hover:text-red-400 disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addItem}
              className="text-sm font-medium text-accent hover:underline"
            >
              + Add item
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-subtle pt-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-lg font-semibold">{formatCurrency(total)}</span>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleCreate}
              disabled={createInvoice.isPending || validItems.length === 0}
              className="flex-1"
            >
              {createInvoice.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create invoice
            </Button>
            <Button variant="ghost" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <Card>
          <p className="text-sm text-muted-foreground">Loading invoices...</p>
        </Card>
      ) : invoiceList.length === 0 ? (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">Draft and share invoices fast</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a payment link and send it to customers on WhatsApp.
              </p>
            </div>
            <Send className="h-5 w-5 text-primary" />
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {invoiceList.map((inv) => (
            <Card key={inv.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{inv.invoiceNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {inv.customer?.name ?? "No customer"} &middot; {inv.items.length} item(s)
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold">{formatCurrency(inv.totalAmount)}</p>
                  <span
                    className={`text-xs ${
                      inv.status === "PAID" ? "text-green-400" : "text-yellow-400"
                    }`}
                  >
                    {inv.status.replace("_", " ")}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
