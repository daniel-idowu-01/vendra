"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BellRing, HandCoins, Loader2 } from "lucide-react";
import { useDebts } from "@/lib/hooks/use-debts-list";
import { useDebtSummary } from "@/lib/hooks/use-dashboard";
import { useRecordPayment, useSendReminder } from "@/lib/hooks/use-debts";

export default function DebtsPage() {
  const { data: debts, isLoading } = useDebts();
  const { data: summary } = useDebtSummary();
  const recordPayment = useRecordPayment();
  const sendReminder = useSendReminder();

  const [payTarget, setPayTarget] = useState<{ id: string; customer: string } | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [remindTarget, setRemindTarget] = useState<{ id: string; customerId: string; customer: string } | null>(null);

  const outstanding = summary?.outstanding ?? 0;
  const debtList = debts ?? [];

  const handlePayment = async () => {
    if (!payTarget || !payAmount) return;
    await recordPayment.mutateAsync({
      debtRecordId: payTarget.id,
      amount: Number(payAmount)
    });
    setPayTarget(null);
    setPayAmount("");
  };

  const handleRemind = async () => {
    if (!remindTarget) return;
    await sendReminder.mutateAsync({
      debtRecordId: remindTarget.id,
      customerId: remindTarget.customerId
    });
    setRemindTarget(null);
  };

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm text-muted-foreground">Debt tracking</p>
        <h1 className="text-2xl font-semibold">Money owed</h1>
      </header>

      <Card>
        <p className="text-sm text-muted-foreground">Outstanding</p>
        <p className="mt-2 text-3xl font-semibold">
          {isLoading ? "..." : `\u20A6${outstanding.toLocaleString()}`}
        </p>
      </Card>

      {isLoading ? (
        <Card>
          <p className="text-sm text-muted-foreground">Loading debts...</p>
        </Card>
      ) : debtList.length === 0 ? (
        <Card>
          <p className="font-medium">No debts recorded</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Outstanding debts from invoices will appear here.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {debtList.map((debt) => (
            <Card key={debt.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{debt.customer.name}</p>
                  <p className="text-sm text-muted-foreground">
                    \u20A6{Number(debt.outstanding).toLocaleString()} outstanding
                    {debt.dueDate ? ` · Due ${new Date(debt.dueDate).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  debt.status === "OVERDUE"
                    ? "bg-red-900/30 text-red-400"
                    : debt.status === "PAID"
                      ? "bg-green-900/30 text-green-400"
                      : "bg-yellow-900/30 text-yellow-400"
                }`}>
                  {debt.status.replace("_", " ")}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  className="h-8 gap-1 text-xs"
                  onClick={() =>
                    setPayTarget({ id: debt.id, customer: debt.customer.name })
                  }
                >
                  <HandCoins className="h-3 w-3" /> Pay
                </Button>
                <Button
                  variant="secondary"
                  className="h-8 gap-1 text-xs"
                  onClick={() =>
                    setRemindTarget({
                      id: debt.id,
                      customerId: debt.customer.id,
                      customer: debt.customer.name
                    })
                  }
                >
                  <BellRing className="h-3 w-3" /> Remind
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {payTarget && (
        <Card className="space-y-3">
          <p className="text-sm font-semibold">Record payment — {payTarget.customer}</p>
          <input
            className="input-surface w-full"
            placeholder="Amount"
            type="number"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
          />
          <div className="flex gap-2">
            <Button onClick={handlePayment} disabled={recordPayment.isPending} className="flex-1">
              {recordPayment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirm
            </Button>
            <Button variant="ghost" onClick={() => setPayTarget(null)}>Cancel</Button>
          </div>
        </Card>
      )}

      {remindTarget && (
        <Card className="space-y-3">
          <p className="text-sm font-semibold">Send reminder — {remindTarget.customer}</p>
          <p className="text-sm text-muted-foreground">
            A WhatsApp reminder will be sent to this customer.
          </p>
          <div className="flex gap-2">
            <Button onClick={handleRemind} disabled={sendReminder.isPending} className="flex-1">
              {sendReminder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Send
            </Button>
            <Button variant="ghost" onClick={() => setRemindTarget(null)}>Cancel</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
