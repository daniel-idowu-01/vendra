"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Loader2, Send } from "lucide-react";
import { useInvoices, useCreateInvoice } from "@/lib/hooks/use-invoices";
import { formatCurrency } from "@/lib/format";

export default function InvoicesPage() {
  const { data: invoices, isLoading } = useInvoices();
  const createInvoice = useCreateInvoice();

  const [showCreate, setShowCreate] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemQty, setItemQty] = useState(1);
  const [itemPrice, setItemPrice] = useState("");

  const invoiceList = invoices ?? [];

  const handleCreate = async () => {
    if (!itemName || !itemPrice) return;
    await createInvoice.mutateAsync({
      items: [{ name: itemName, quantity: itemQty, unitPrice: Number(itemPrice) }]
    });
    setShowCreate(false);
    setItemName("");
    setItemQty(1);
    setItemPrice("");
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Invoices</p>
          <h1 className="text-2xl font-semibold">Get paid</h1>
        </div>
        <Button className="h-10 w-10 px-0 text-[#08070a]" aria-label="Create invoice" onClick={() => setShowCreate(true)}>
          <Plus className="h-5 w-5 shrink-0" strokeWidth={2.5} />
        </Button>
      </header>

      {showCreate && (
        <Card className="space-y-3">
          <p className="text-sm font-semibold">New invoice</p>
          <input className="input-surface w-full" placeholder="Item name" value={itemName} onChange={(e) => setItemName(e.target.value)} />
          <input className="input-surface w-full" type="number" min={1} placeholder="Quantity" value={itemQty} onChange={(e) => setItemQty(Number(e.target.value))} />
          <input className="input-surface w-full" type="number" placeholder="Unit price" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={createInvoice.isPending} className="flex-1">
              {createInvoice.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create
            </Button>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
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
                  <p className="text-lg font-semibold">
                    {formatCurrency(inv.totalAmount)}
                  </p>
                  <span className={`text-xs ${
                    inv.status === "PAID" ? "text-green-400" : "text-yellow-400"
                  }`}>
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
