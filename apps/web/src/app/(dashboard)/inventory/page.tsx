import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Barcode, PackagePlus, Search } from "lucide-react";

export default function InventoryPage() {
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Inventory</p>
          <h1 className="text-2xl font-semibold">Stock room</h1>
        </div>
        <Button className="h-10 w-10 px-0" aria-label="Add product">
          <PackagePlus className="h-5 w-5" />
        </Button>
      </header>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1 justify-start gap-2">
          <Search className="h-4 w-4" /> Search products
        </Button>
        <Button variant="secondary" className="h-10 w-10 px-0" aria-label="Scan barcode">
          <Barcode className="h-5 w-5" />
        </Button>
      </div>
      <Card>
        <p className="font-medium">Low stock alerts</p>
        <p className="mt-1 text-sm text-muted-foreground">Products at or below their reorder level will appear here.</p>
      </Card>
    </div>
  );
}
