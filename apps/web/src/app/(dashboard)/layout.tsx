import { MobileNav } from "@/components/app-shell/mobile-nav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative mx-auto min-h-screen max-w-md px-4 pb-28 pt-8">
      <div className="absolute inset-x-0 top-0 -z-10 h-64 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_45%)]" />
      <div className="mb-6 rounded-[2rem] bg-surface/90 p-5 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.55)] backdrop-blur-xl ring-1 ring-white/10">
        <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">Welcome back</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-foreground">Your business control surface</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Access stock, invoices, payments and customer conversations from one polished workspace.
        </p>
      </div>
      {children}
      <MobileNav />
    </main>
  );
}
