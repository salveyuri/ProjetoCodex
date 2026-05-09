import { cn } from "@/lib/cn";

type StatusBadgeTone = "success" | "warning" | "danger" | "neutral";

interface StatusBadgeProps {
  children: React.ReactNode;
  tone?: StatusBadgeTone;
}

const toneClasses: Record<StatusBadgeTone, string> = {
  success: "border-secondary/40 bg-secondary/10 text-secondary",
  warning: "border-accent/40 bg-accent/10 text-accent",
  danger: "border-danger/40 bg-danger/10 text-danger",
  neutral: "border-border bg-surface-muted text-muted",
};

export const StatusBadge = ({
  children,
  tone = "neutral",
}: StatusBadgeProps) => (
  <span
    className={cn(
      "inline-flex min-h-7 items-center rounded-md border px-2.5 text-sm font-medium",
      toneClasses[tone],
    )}
  >
    {children}
  </span>
);
