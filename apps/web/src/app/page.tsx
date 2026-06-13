"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  MessageCircle,
  Package,
  FileText,
  HandCoins,
  BarChart3,
  Wifi,
  ArrowRight,
  Check,
  Smartphone,
  Store,
  TrendingUp
} from "lucide-react";

const features = [
  {
    icon: MessageCircle,
    title: "WhatsApp-first operations",
    description:
      "Manage stock, create invoices and follow up customers directly from WhatsApp — no app downloads needed."
  },
  {
    icon: Package,
    title: "Smart inventory",
    description:
      "Track stock across multiple branches, set low-stock alerts, and get restock recommendations."
  },
  {
    icon: FileText,
    title: "Instant invoicing",
    description:
      "Generate and send professional invoices via WhatsApp or email. Payment links included."
  },
  {
    icon: HandCoins,
    title: "Debt recovery",
    description:
      "Automated payment reminders and WhatsApp follow-ups for overdue invoices."
  },
  {
    icon: BarChart3,
    title: "Business analytics",
    description:
      "Real-time dashboards for sales, inventory turnover, and customer insights."
  },
  {
    icon: Wifi,
    title: "Works offline",
    description:
      "Queue actions when offline — they sync automatically when you're back online."
  }
];

const steps = [
  {
    icon: Smartphone,
    title: "Connect your WhatsApp",
    description:
      "Link your business phone number in one click. Your customers can reach you on the channel they already use."
  },
  {
    icon: Store,
    title: "Set up your shop",
    description:
      "Add products, configure branches, and invite your team. Takes less than 10 minutes."
  },
  {
    icon: TrendingUp,
    title: "Grow your business",
    description:
      "Sell, invoice and collect payments — all from one polished workspace. Your AI assistant handles the rest."
  }
];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen">
      <div className="absolute inset-x-0 top-0 -z-10 h-[600px] bg-glow" />

      <header className="sticky top-0 z-30 border-b border-subtle bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-10">
          <Link href="/" className="text-lg font-semibold tracking-[-0.02em] text-foreground">
            Vendra
          </Link>
          <div className="flex items-center gap-3">
            <nav className="hidden items-center gap-1 sm:flex">
              <a href="#features" className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
                Features
              </a>
              <a href="#how-it-works" className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
                How it works
              </a>
            </nav>
            <ThemeToggle />
            <Link href="/login">
              <Button className="hidden sm:inline-flex">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24 lg:px-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">
              WhatsApp-first business OS
            </p>
            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl">
              Run your business from{" "}
              <span className="text-accent">WhatsApp</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Vendra is the operating system for African SMEs. Manage inventory,
              send invoices, track debts and get insights — all through WhatsApp
              and a polished web dashboard.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/login">
                <Button className="w-full sm:w-auto">
                  Get started free
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="#features">
                <Button variant="secondary" className="w-full sm:w-auto">
                  Learn more
                </Button>
              </a>
            </div>
          </div>

          <div className="mt-20 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { value: "10x", label: "Faster operations" },
              { value: "100%", label: "WhatsApp-native" },
              { value: "0", label: "App downloads needed" },
              { value: "24/7", label: "AI assistant" }
            ].map((stat) => (
              <div key={stat.label} className="glass-panel p-5 text-center">
                <p className="text-3xl font-semibold text-accent sm:text-4xl">{stat.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="border-t border-subtle py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">
                Everything you need
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-4xl">
                One workspace. Zero complexity.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                No more juggling between apps. Vendra brings your entire
                operation into a single, intelligent system.
              </p>
            </div>

            <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <div key={feature.title} className="card-surface p-6 transition hover:-translate-y-0.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15">
                    <feature.icon className="h-5 w-5 text-accent" />
                  </div>
                  <p className="mt-5 font-semibold text-foreground">{feature.title}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-t border-subtle py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">
                Simple setup
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-4xl">
                Get started in minutes
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                No technical skills required. No app stores. Just your WhatsApp
                and a browser.
              </p>
            </div>

            <div className="mt-14 grid gap-6 sm:grid-cols-3">
              {steps.map((step, i) => (
                <div key={step.title} className="relative text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/15">
                    <step.icon className="h-6 w-6 text-accent" />
                  </div>
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-[#08070a]">
                      {i + 1}
                    </span>
                  </div>
                  <p className="mt-3 font-semibold text-foreground">{step.title}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-subtle py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
            <div className="glass-panel mx-auto max-w-3xl p-8 text-center sm:p-12">
              <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">
                Get started
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-4xl">
                Ready to transform your business?
              </h2>
              <p className="mx-auto mt-4 max-w-md text-base leading-7 text-muted-foreground">
                Join African SMEs that run their operations from WhatsApp and
                one beautiful dashboard.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/login">
                  <Button>
                    Create free account
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-accent" /> No credit card
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-accent" /> Free WhatsApp integration
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-accent" /> Cancel anytime
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-subtle">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6 lg:px-10">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Vendra. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link href="/login" className="text-sm text-muted-foreground transition hover:text-foreground">
              Sign in
            </Link>
            <Link href="/login" className="text-sm text-muted-foreground transition hover:text-foreground">
              Create account
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
