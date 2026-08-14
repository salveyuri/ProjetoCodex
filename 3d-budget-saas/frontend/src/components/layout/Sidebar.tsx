"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Calculator,
  ChevronLeft,
  ChevronRight,
  Code2,
  CreditCard,
  FileText,
  LayoutDashboard,
  Package,
  PlusCircle,
  Settings,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/contexts/AuthContext";

interface SidebarProps {
  collapsed: boolean;
  open: boolean;
  onClose: () => void;
  onToggleCollapsed: () => void;
}

interface NavigationItem {
  href: Route;
  label: string;
  icon: LucideIcon;
}

const navigation: NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/quotes", label: "Orcamentos", icon: FileText },
  { href: "/dashboard/quotes/new", label: "Novo orcamento", icon: PlusCircle },
  { href: "/dashboard/calculator", label: "Calculadora", icon: Calculator },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/settings/formulas", label: "Formulas", icon: Code2 },
  { href: "/dashboard/billing", label: "Plano", icon: CreditCard },
  { href: "/dashboard/settings", label: "Configuracoes", icon: Settings },
];

export const Sidebar = ({
  collapsed,
  open,
  onClose,
  onToggleCollapsed,
}: SidebarProps) => {
  const pathname = usePathname();
  const { user } = useAuth();
  const items = user?.role === "ADMIN"
    ? [
        ...navigation,
        { href: "/admin/analytics" as Route, label: "Admin BI", icon: ShieldCheck },
        { href: "/admin/users" as Route, label: "Admin Users", icon: UsersRound },
        { href: "/admin/plans" as Route, label: "Admin Planos", icon: Package },
      ]
    : navigation;

  return (
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
        "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-background/95 px-4 py-4 shadow-panel transition-all lg:translate-x-0",
        collapsed && "lg:w-24",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex min-h-12 items-center gap-3">
        <Image
          src="/logo_icon.webp"
          alt="Pricify3D"
          width={40}
          height={40}
          className="shrink-0 rounded-lg"
        />
        <div className={cn("min-w-0", collapsed && "lg:hidden")}>
          <p className="text-base font-semibold text-foreground">Pricify3D</p>
        </div>
        <button
          type="button"
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          onClick={onToggleCollapsed}
          className="ml-auto hidden h-10 w-10 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary lg:grid"
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </button>
        <button
          type="button"
          title="Fechar menu"
          aria-label="Fechar menu"
          onClick={onClose}
          className={cn(
            "ml-auto grid h-10 w-10 place-items-center rounded-lg border border-border text-muted transition hover:border-primary hover:text-primary lg:hidden",
            !collapsed && "lg:ml-0",
          )}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="mt-8 grid gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/dashboard"
              ? pathname === item.href
              : item.href.startsWith("/admin")
                ? pathname.startsWith(item.href)
              : item.href === "/dashboard/quotes/new"
                ? pathname === item.href
              : item.href === "/dashboard/settings"
                ? pathname === item.href
                : item.href === "/dashboard/quotes"
                  ? pathname === item.href ||
                    (pathname.startsWith("/dashboard/quotes/") &&
                      pathname !== "/dashboard/quotes/new")
                  : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted transition hover:bg-surface hover:text-foreground",
                collapsed && "lg:justify-center lg:px-0",
                isActive &&
                  "border border-primary/30 bg-primary/10 text-primary",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className={cn(collapsed && "lg:hidden")}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
    </>
  );
};
