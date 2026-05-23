import Link from "next/link";
import { MobileNav } from "@/components/app-shell/mobile-nav";
import { AuthGuard } from "@/components/auth/auth-guard";
import { LogoutButton } from "@/components/auth/logout-button";

const navItems = [
  { href: "/" as const, label: "Dashboard" },
  { href: "/inventory" as const, label: "Stock" },
  { href: "/invoices" as const, label: "Invoices" },
  { href: "/debts" as const, label: "Debts" },
  { href: "/analytics" as const, label: "Analytics" }
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <main className="relative mx-auto min-h-screen max-w-7xl px-4 pb-28 pt-8 sm:px-6 lg:px-10">
        <div className="absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_46%)]" />

        <div className="hidden md:block">
          <div className="mb-8 rounded-[2rem] border border-white/10 bg-surface/85 p-6 shadow-[0_28px_90px_-60px_rgba(0,0,0,0.6)] backdrop-blur-xl">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Control surface</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-foreground">Dashboard</h1>
              </div>
              <nav className="flex flex-wrap items-center gap-3">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-full border border-white/10 bg-surface-soft/90 px-4 py-2 text-sm font-medium text-muted-foreground transition hover:border-accent/40 hover:bg-surface hover:text-white"
                  >
                    {item.label}
                  </Link>
                ))}
                <LogoutButton />
              </nav>
            </div>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <div className="rounded-[2rem] bg-surface/90 p-6 shadow-[0_24px_80px_-45px_rgba(0,0,0,0.55)] ring-1 ring-white/10 backdrop-blur-xl md:hidden">
              <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Welcome back</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-foreground">Your business control surface</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Access stock, invoices, payments and customer conversations from one polished workspace.
              </p>
            </div>
            {children}
          </div>

          <aside className="hidden md:block">
            <div className="glass-panel p-6">
              <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Quick status</p>
              <div className="mt-6 space-y-4">
                <div className="rounded-3xl bg-surface-soft/90 p-5">
                  <p className="text-sm text-muted-foreground">Today</p>
                  <p className="mt-3 text-2xl font-semibold text-foreground">Dashboard ready</p>
                </div>
                <div className="rounded-3xl bg-surface-soft/90 p-5">
                  <p className="text-sm text-muted-foreground">Navigation</p>
                  <p className="mt-3 text-sm leading-6 text-foreground">Use the desktop toolbar for quick access and the bottom bar on mobile.</p>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <MobileNav />
      </main>
    </AuthGuard>
  );
}
