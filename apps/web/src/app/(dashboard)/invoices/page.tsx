import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilePlus2, Share2 } from "lucide-react";

export default function InvoicesPage() {
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Invoices</p>
          <h1 className="text-2xl font-semibold">Get paid</h1>
        </div>
        <Button className="h-10 w-10 px-0" aria-label="Create invoice">
          <FilePlus2 className="h-5 w-5" />
        </Button>
      </header>
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">Draft and share invoices fast</p>
            <p className="mt-1 text-sm text-muted-foreground">Create a payment link and send it to customers on WhatsApp.</p>
          </div>
          <Share2 className="h-5 w-5 text-primary" />
        </div>
      </Card>
    </div>
  );
}
