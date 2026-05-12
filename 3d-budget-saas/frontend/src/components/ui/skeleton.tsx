import { cn } from "@/lib/cn";

export const Skeleton = ({ className }: { className?: string }) => (
  <div
    className={cn(
      "animate-pulse rounded-lg border border-border bg-surface-muted/80",
      className,
    )}
  />
);

export const SkeletonText = ({ className }: { className?: string }) => (
  <div className={cn("h-3 animate-pulse rounded-full bg-surface-muted", className)} />
);
