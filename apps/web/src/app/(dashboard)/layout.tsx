import { MobileNav } from "@/components/app-shell/mobile-nav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-4">
      {children}
      <MobileNav />
    </main>
  );
}
