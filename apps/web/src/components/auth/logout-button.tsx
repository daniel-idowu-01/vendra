"use client";

import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { LogOut } from "lucide-react";
import { queryClient } from "@/lib/query-client";
import { apiFetch } from "@/lib/api-client";

export function LogoutButton() {
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);

  const handleLogout = async () => {
    // Revoke the refresh token server-side and clear its httpOnly cookie before
    // dropping local state, so a stolen cookie can't be reused after logout.
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Ignore — we clear local state regardless.
    }
    clear();
    queryClient.clear();
    router.replace("/login");
  };

  return (
    <button
      onClick={handleLogout}
      className="rounded-full border border-subtle bg-surface-soft/90 px-4 py-2 text-sm font-medium text-muted-foreground transition hover:border-red-400/40 hover:bg-surface hover:text-red-400 flex items-center gap-2"
    >
      <LogOut className="h-3.5 w-3.5" />
      Logout
    </button>
  );
}
