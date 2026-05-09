import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Card = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "rounded-lg border border-border bg-surface/90 shadow-panel",
      className,
    )}
    {...props}
  />
);
