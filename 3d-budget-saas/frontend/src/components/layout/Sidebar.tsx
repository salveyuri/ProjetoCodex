"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  Calculator,
  Cpu,
  Gauge,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  type LucideIcon,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

interface NavigationItem {
  href: Route;
  hash?: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
}

const navigation: NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, active: true },
  { href: "/dashboard", hash: "quotes", label: "Orcamentos", icon: Calculator },
  { href: "/dashboard", hash: "materials", label: "Materiais", icon: Cpu },
  { href: "/dashboard", hash: "quality", label: "Calibracao", icon: Gauge },
  { href: "/dashboard", hash: "security", label: "Acesso", icon: ShieldCheck },
  { href: "/dashboard", hash: "settings", label: "Configuracoes", icon: Settings },
];

export const Sidebar = ({ open, onClose }: SidebarProps) => (
  <>
    <button
      type="button"
      aria-label="Fechar menu"
      title="Fechar menu"
      onClick={onClose}
      className={cn(
        "fixed inset-0 z-40 bg-black/60 transition lg:hidden",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    />

    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-background/95 px-4 py-4 shadow-panel transition-transform lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex min-h-12 items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Cpu className="h-5 w-5" />
        </div>
        <div>
          <p className="text-base font-semibold text-foreground">3D Budget</p>
          <p className="text-sm text-muted">PrintOps Console</p>
        </div>
        <button
          type="button"
          title="Fechar menu"
          aria-label="Fechar menu"
          onClick={onClose}
          className="ml-auto grid h-10 w-10 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="mt-8 grid gap-2">
        {navigation.map((item) => {
          const Icon = item.icon;
          const href = item.hash
            ? { pathname: item.href, hash: item.hash }
            : item.href;

          return (
            <Link
              key={`${item.href}${item.hash ?? ""}`}
              href={href}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted transition hover:bg-surface hover:text-foreground",
                item.active &&
                  "border border-primary/30 bg-primary/10 text-primary",
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-lg border border-border bg-surface p-3">
        <p className="text-sm font-medium text-foreground">MVP Core</p>
        <p className="mt-1 text-sm text-muted">Budgeting Logic entra na proxima etapa.</p>
      </div>
    </aside>
  </>
);
