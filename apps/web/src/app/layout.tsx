import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/lib/providers";

export const metadata: Metadata = {
  title: "Vendra",
  description: "WhatsApp-first business operating system for African SMEs."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>
          <div className="relative isolate min-h-screen overflow-hidden">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
