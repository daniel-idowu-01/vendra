import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mic, Plus, Send } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="space-y-5 pb-10">
      <section className="glass-panel overflow-hidden px-6 py-7 animate-fade-up">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.32em] text-muted-foreground">Today</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-foreground">Your business assistant is ready.</h1>
          </div>
          <span className="rounded-full bg-accent/15 px-3 py-1 text-sm font-semibold text-accent">Live</span>
        </div>
        <p className="max-w-xl text-sm leading-7 text-muted-foreground">
          Check stock, create invoices and follow up debtors from WhatsApp or this dashboard with one polished workflow.
        </p>
      </section>

      <div className="grid grid-cols-3 gap-3 animate-fade-up">
        <Button className="w-full flex-col gap-2 px-3 text-sm">
          <Plus className="h-4 w-4" /> Sale
        </Button>
        <Button variant="secondary" className="w-full flex-col gap-2 px-3 text-sm">
          <Send className="h-4 w-4" /> Invoice
        </Button>
        <Button variant="secondary" className="w-full flex-col gap-2 px-3 text-sm">
          <Mic className="h-4 w-4" /> Voice
        </Button>
      </div>

      <Card className="animate-fade-up">
        <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Insights</p>
        <p className="mt-3 text-lg font-semibold text-foreground">
          3 products need restocking and 2 customers have overdue balances.
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="animate-fade-up">
          <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Today’s sales</p>
          <p className="mt-3 text-3xl font-semibold">₦0</p>
        </Card>
        <Card className="animate-fade-up">
          <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Open debt</p>
          <p className="mt-3 text-3xl font-semibold">₦0</p>
        </Card>
      </div>
    </div>
  );
}
