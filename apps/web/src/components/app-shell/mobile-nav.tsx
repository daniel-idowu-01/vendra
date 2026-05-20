"use client";

import Link from "next/link";
import { BarChart3, Boxes, FileText, HandCoins, MessageCircle } from "lucide-react";

const items = [
  { href: "/", label: "Home", icon: MessageCircle },
  { href: "/inventory", label: "Stock", icon: Boxes },
  { href: "/invoices", label: "Invoice", icon: FileText },
  { href: "/debts", label: "Debts", icon: HandCoins },
  { href: "/analytics", label: "Sales", icon: BarChart3 }
];

export function MobileNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="flex h-16 flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
            <item.icon className="h-5 w-5" aria-hidden />
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
