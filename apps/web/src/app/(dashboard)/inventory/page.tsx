"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Barcode, Plus, Search, Loader2, Upload } from "lucide-react";
import { ProductImportResult, useProducts, useCreateProduct, useImportProducts } from "@/lib/hooks/use-inventory";
import { formatCurrency } from "@/lib/format";

export default function InventoryPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useProducts(page, 50);
  const createProduct = useCreateProduct();

  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ProductImportResult | null>(null);
  const [importError, setImportError] = useState("");
  const importProducts = useImportProducts();

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
      sellingPrice: Number(newPrice) || 0,
      initialQuantity: Number(newQuantity) || 0
    });
    setShowAdd(false);
    setNewName("");
    setNewPrice("");
    setNewQuantity("");
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImportError("");
    setImportResult(null);
    try {
      const result = await importProducts.mutateAsync(importFile);
      setImportResult(result);
      setImportFile(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Failed to import products");
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Inventory</p>
          <h1 className="text-2xl font-semibold">Stock room</h1>
        </div>
        <Button className="h-10 w-10 px-0 text-[#08070a]" aria-label="Add product" onClick={() => setShowAdd(true)}>
          <Plus className="h-5 w-5 shrink-0" strokeWidth={2.5} />
        </Button>
      </header>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 shrink-0 text-muted-foreground"
            strokeWidth={2.25}
          />
          <input
            className="input-surface input-with-icon w-full"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="secondary" className="h-10 w-10 px-0" aria-label="Scan barcode">
          <Barcode className="h-5 w-5" />
        </Button>
      </div>

      <Card className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Import products</p>
            <p className="mt-1 text-sm text-muted-foreground">Upload CSV, XLS, or XLSX with product name, price, and quantity columns.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              className="input-surface max-w-full sm:w-72"
              type="file"
              accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                setImportFile(event.target.files?.[0] ?? null);
                setImportResult(null);
                setImportError("");
              }}
            />
            <Button onClick={handleImport} disabled={!importFile || importProducts.isPending}>
              {importProducts.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import
            </Button>
          </div>
        </div>
        {importResult && (
          <p className="text-sm text-green-500">
            Imported {importResult.totalProcessed} products: {importResult.created} created, {importResult.updated} updated, {importResult.skipped} skipped.
          </p>
        )}
        {importError && <p className="text-sm text-red-400">{importError}</p>}
      </Card>

      {showAdd && (
        <Card className="space-y-3">
          <p className="text-sm font-semibold">New product</p>
          <input className="input-surface w-full" placeholder="Product name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input className="input-surface w-full" placeholder="Selling price" type="number" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
          <input className="input-surface w-full" placeholder="Opening quantity" type="number" value={newQuantity} onChange={(e) => setNewQuantity(e.target.value)} />
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
                  {formatCurrency(product.sellingPrice)}
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
