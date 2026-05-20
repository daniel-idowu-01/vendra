import { Card } from "@/components/ui/card";

export default function AnalyticsPage() {
  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm text-muted-foreground">Analytics</p>
        <h1 className="text-2xl font-semibold">Business pulse</h1>
      </header>
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="text-sm text-muted-foreground">Weekly sales</p>
          <p className="mt-2 text-2xl font-semibold">₦0</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Top product</p>
          <p className="mt-2 font-semibold">None yet</p>
        </Card>
      </div>
      <Card>
        <p className="font-medium">Daily summary</p>
        <p className="mt-1 text-sm text-muted-foreground">AI-generated sales and stock summaries will appear here after transactions begin.</p>
      </Card>
    </div>
  );
}
