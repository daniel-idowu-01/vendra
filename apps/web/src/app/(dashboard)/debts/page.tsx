import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BellRing, HandCoins } from "lucide-react";

export default function DebtsPage() {
  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm text-muted-foreground">Debt tracking</p>
        <h1 className="text-2xl font-semibold">Money owed</h1>
      </header>
      <Card>
        <p className="text-sm text-muted-foreground">Outstanding</p>
        <p className="mt-2 text-3xl font-semibold">₦0</p>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <Button className="h-14 gap-2">
          <HandCoins className="h-4 w-4" /> Payment
        </Button>
        <Button variant="secondary" className="h-14 gap-2">
          <BellRing className="h-4 w-4" /> Remind
        </Button>
      </div>
    </div>
  );
}
