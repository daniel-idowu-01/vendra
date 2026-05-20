import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Vendra</p>
        <h1 className="text-3xl font-semibold">Run your shop from WhatsApp.</h1>
      </div>
      <form className="mt-8 space-y-3">
        <input className="h-11 w-full rounded-md border border-border bg-card px-3" placeholder="Email" type="email" />
        <input className="h-11 w-full rounded-md border border-border bg-card px-3" placeholder="Password" type="password" />
        <Button className="w-full">Log in</Button>
      </form>
    </main>
  );
}
