import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mic, Plus, Send } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-lg bg-primary p-5 text-primary-foreground">
        <p className="text-sm opacity-90">Today</p>
        <h1 className="mt-1 text-2xl font-semibold">Your business assistant is ready.</h1>
        <p className="mt-2 text-sm opacity-90">Check stock, create invoices, and follow up debtors from WhatsApp or this dashboard.</p>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <Button className="h-14 flex-col gap-1 px-2">
          <Plus className="h-4 w-4" /> Sale
        </Button>
        <Button variant="secondary" className="h-14 flex-col gap-1 px-2">
          <Send className="h-4 w-4" /> Invoice
        </Button>
        <Button variant="secondary" className="h-14 flex-col gap-1 px-2">
          <Mic className="h-4 w-4" /> Voice
        </Button>
      </div>

      <Card>
        <p className="text-sm text-muted-foreground">AI insight</p>
        <p className="mt-1 font-medium">3 products need restocking and 2 customers have overdue balances.</p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="text-sm text-muted-foreground">Today’s sales</p>
          <p className="mt-2 text-2xl font-semibold">₦0</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Open debt</p>
          <p className="mt-2 text-2xl font-semibold">₦0</p>
        </Card>
      </div>
    </div>
  );
}
