"use client";

import { Card } from "@/components/ui/card";
import { useAnalytics } from "@/lib/hooks/use-analytics";
import { formatCurrency } from "@/lib/format";

export default function AnalyticsPage() {
  const { data, isLoading } = useAnalytics();

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm text-muted-foreground">Analytics</p>
        <h1 className="text-2xl font-semibold">Business pulse</h1>
      </header>
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="text-sm text-muted-foreground">Today&rsquo;s sales</p>
          <p className="mt-2 text-2xl font-semibold">
            {isLoading ? "..." : formatCurrency(data?.todaySales)}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Open debt</p>
          <p className="mt-2 text-2xl font-semibold">
            {isLoading ? "..." : formatCurrency(data?.openDebt)}
          </p>
        </Card>
      </div>
      <Card>
        <p className="font-medium">Daily summary</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {isLoading
            ? "Loading..."
            : data?.insights?.length
              ? data.insights.join(" ")
              : "AI-generated sales and stock summaries will appear here after transactions begin."}
        </p>
      </Card>
    </div>
  );
}
