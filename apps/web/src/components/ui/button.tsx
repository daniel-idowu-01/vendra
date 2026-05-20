import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium transition active:scale-[0.99] disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-foreground",
        variant === "secondary" && "border border-border bg-card text-foreground",
        variant === "ghost" && "text-foreground hover:bg-muted",
        className
      )}
      {...props}
    />
  );
}
