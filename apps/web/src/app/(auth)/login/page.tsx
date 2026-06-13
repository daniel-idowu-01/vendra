"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useLogin, useSignup } from "@/lib/hooks/use-auth";
import { useAuthStore } from "@/lib/auth-store";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const login = useLogin();
  const signup = useSignup();

  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  const isPending = login.isPending || signup.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      if (isSignup) {
        const result = await signup.mutateAsync({
          email,
          password,
          name,
          organizationName: orgName,
          phone: phone || undefined
        });
        setSession(result);
        router.push("/dashboard");
      } else {
        const result = await login.mutateAsync({ email, password });
        setSession(result);
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    }
  };

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="absolute inset-x-0 top-16 -z-10 h-72 rounded-full bg-accent-glow blur-3xl" />
      <div className="relative space-y-8 glass-panel p-8">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.32em] text-muted-foreground">Vendra</p>
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">
            {isSignup ? "Create your workspace" : "Run your shop from WhatsApp"}
          </h1>
          <p className="max-w-lg text-sm text-muted-foreground">
            {isSignup
              ? "Set up your business to start selling and tracking inventory."
              : "Log in to manage stock, invoices and customer conversations."}
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-900/20 p-3 text-sm text-red-400">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Email</label>
            <input
              className="input-surface w-full"
              placeholder="you@business.com"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {isSignup && (
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">Name</label>
              <input
                className="input-surface w-full"
                placeholder="Your name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}
          {isSignup && (
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">Organization</label>
              <input
                className="input-surface w-full"
                placeholder="Business name"
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
            </div>
          )}
          {isSignup && (
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">WhatsApp number (optional)</label>
              <input
                className="input-surface w-full"
                placeholder="+2348123456789"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">Link your phone to use Vendra via WhatsApp.</p>
            </div>
          )}
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">Password</label>
            <input
              className="input-surface w-full"
              placeholder="••••••••"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isSignup ? "Create account" : "Log in"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {isSignup ? "Already have an account?" : "Don&apos;t have an account?"}{" "}
          <button
            type="button"
            className="font-semibold text-accent hover:underline"
            onClick={() => {
              setIsSignup(!isSignup);
              setError("");
            }}
          >
            {isSignup ? "Log in" : "Sign up"}
          </button>
        </p>
      </div>
    </main>
  );
}
