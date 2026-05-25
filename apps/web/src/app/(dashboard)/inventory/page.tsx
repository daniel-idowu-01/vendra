"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Barcode, PackagePlus, Search, Loader2 } from "lucide-react";
import { useProducts, useCreateProduct } from "@/lib/hooks/use-inventory";

export default function InventoryPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useProducts(page, 50);
  const createProduct = useCreateProduct();

  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");

  const products = data?.items ?? [];
  const total = data?.total ?? 0;
  const filtered = search
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.sku?.toLowerCase().includes(search.toLowerCase())
      )
    : products;

  const handleAdd = async () => {
    if (!newName) return;
    await createProduct.mutateAsync({
      name: newName,
      sellingPrice: Number(newPrice) || 0
    });
    setShowAdd(false);
    setNewName("");
    setNewPrice("");
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Inventory</p>
          <h1 className="text-2xl font-semibold">Stock room</h1>
        </div>
        <Button className="h-10 w-10 px-0" aria-label="Add product" onClick={() => setShowAdd(true)}>
          <PackagePlus className="h-5 w-5" />
        </Button>
      </header>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input-surface w-full pl-10"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="secondary" className="h-10 w-10 px-0" aria-label="Scan barcode">
          <Barcode className="h-5 w-5" />
        </Button>
      </div>

      {showAdd && (
        <Card className="space-y-3">
          <p className="text-sm font-semibold">New product</p>
          <input className="input-surface w-full" placeholder="Product name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input className="input-surface w-full" placeholder="Selling price" type="number" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={handleAdd} disabled={createProduct.isPending} className="flex-1">
              {createProduct.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add
            </Button>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <Card>
          <p className="text-sm text-muted-foreground">Loading products...</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <p className="font-medium">
            {search ? "No matching products" : "No products yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {search
              ? "Try a different search term."
              : "Add your first product to start tracking inventory."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((product) => (
            <Card key={product.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{product.name}</p>
                  <p className="text-sm text-muted-foreground">
                    SKU: {product.sku ?? "—"} &middot; Unit: {product.unit}
                  </p>
                </div>
                <p className="text-lg font-semibold">
                  \u20A6{product.sellingPrice.toLocaleString()}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {total > 50 && (
        <div className="flex justify-center gap-2">
          <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="flex items-center text-sm text-muted-foreground">
            Page {page} of {Math.ceil(total / 50)}
          </span>
          <Button variant="ghost" disabled={page * 50 >= total} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
