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
    <nav className="fixed inset-x-0 bottom-0 z-20 md:hidden border-t border-white/10 bg-surface/85 backdrop-blur-xl shadow-[0_-20px_60px_-35px_rgba(0,0,0,0.65)]">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex h-16 flex-col items-center justify-center gap-1 text-[0.72rem] text-muted-foreground transition hover:text-white"
          >
            <item.icon className="h-5 w-5 transition group-hover:scale-110" aria-hidden />
            <span className="text-[0.65rem] tracking-[0.2em] uppercase">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
