import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="absolute inset-x-0 top-16 -z-10 h-72 rounded-full bg-[radial-gradient(circle_at_top_left,rgba(255,195,60,0.16),transparent_30%)] blur-3xl" />
      <div className="relative space-y-8 glass-panel p-8">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.32em] text-muted-foreground">Vendra</p>
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">Run your shop from WhatsApp</h1>
          <p className="max-w-lg text-sm text-muted-foreground">
            A polished mobile-first control surface for sales, inventory, invoices, and customer follow-up.
          </p>
        </div>

        <form className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Email</label>
            <input className="input-surface" placeholder="you@business.com" type="email" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Password</label>
            <input className="input-surface" placeholder="••••••••" type="password" />
          </div>
          <Button className="w-full">Log in</Button>
        </form>
      </div>
    </main>
  );
}
