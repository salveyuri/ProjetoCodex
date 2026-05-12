import type { LucideIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

interface EmptyStateProps {
  actionHref?: Route;
  actionLabel?: string;
  description: string;
  icon: LucideIcon;
  title: string;
}

export const EmptyState = ({
  actionHref,
  actionLabel,
  description,
  icon: Icon,
  title,
}: EmptyStateProps) => (
  <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-border bg-background/70 p-6 text-center">
    <div className="max-w-sm">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg border border-border bg-surface text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <p className="mt-4 text-base font-semibold text-foreground">{title}</p>
      <p className="mt-2 text-sm text-muted">{description}</p>
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="mt-5 inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  </div>
);
