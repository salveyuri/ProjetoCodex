"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Calculator,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  CreditCard,
  FileText,
  LayoutDashboard,
  Mail,
  Package,
  PlusCircle,
  Settings,
  ShieldCheck,
  Sigma,
  UsersRound,
  type LucideIcon,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/i18n";

interface SidebarProps {
  collapsed: boolean;
  open: boolean;
  onClose: () => void;
  onToggleCollapsed: () => void;
}

interface NavigationItem {
  href: Route;
  labelKey: TranslationKey;
  icon: LucideIcon;
}

const navigation: NavigationItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/dashboard/quotes", labelKey: "nav.quotes", icon: FileText },
  { href: "/dashboard/quotes/new", labelKey: "nav.newQuote", icon: PlusCircle },
  { href: "/dashboard/calculator", labelKey: "nav.calculator", icon: Calculator },
  { href: "/dashboard/analytics", labelKey: "nav.analytics", icon: BarChart3 },
  { href: "/dashboard/settings/formulas", labelKey: "nav.formulas", icon: Code2 },
  { href: "/dashboard/billing", labelKey: "nav.plan", icon: CreditCard },
  { href: "/dashboard/settings", labelKey: "nav.settings", icon: Settings },
];

// Admin screens stay Portuguese-only for now (Contextos/Decisoes.md,
// 2026-08-17) — these labels are deliberately not run through t().
interface AdminNavigationItem {
  href: Route;
  label: string;
  icon: LucideIcon;
}

const adminNavigation: AdminNavigationItem[] = [
  { href: "/admin/analytics" as Route, label: "Admin BI", icon: ShieldCheck },
  { href: "/admin/users" as Route, label: "Admin Users", icon: UsersRound },
  { href: "/admin/plans" as Route, label: "Admin Planos", icon: Package },
  { href: "/admin/email-templates" as Route, label: "Admin E-mails", icon: Mail },
  { href: "/admin/system-formulas" as Route, label: "Admin Formulas", icon: Sigma },
];

export const Sidebar = ({
  collapsed,
  open,
  onClose,
  onToggleCollapsed,
}: SidebarProps) => {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useLanguage();
  const isAdmin = user?.role === "ADMIN";
  const isAdminSectionActive = pathname.startsWith("/admin");
  const [adminOpen, setAdminOpen] = useState(isAdminSectionActive);

  return (
    <>
    <button
      type="button"
      aria-label={t("nav.closeMenu")}
      title={t("nav.closeMenu")}
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
          title={collapsed ? t("nav.expandMenu") : t("nav.collapseMenu")}
          aria-label={collapsed ? t("nav.expandMenu") : t("nav.collapseMenu")}
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
          title={t("nav.closeMenu")}
          aria-label={t("nav.closeMenu")}
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
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/dashboard"
              ? pathname === item.href
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
              title={collapsed ? t(item.labelKey) : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted transition hover:bg-surface hover:text-foreground",
                collapsed && "lg:justify-center lg:px-0",
                isActive &&
                  "border border-primary/30 bg-primary/10 text-primary",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className={cn(collapsed && "lg:hidden")}>{t(item.labelKey)}</span>
            </Link>
          );
        })}

        {isAdmin ? (
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setAdminOpen((current) => !current)}
              title={collapsed ? t("nav.admin") : undefined}
              aria-expanded={adminOpen}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted transition hover:bg-surface hover:text-foreground",
                collapsed && "lg:justify-center lg:px-0",
                isAdminSectionActive &&
                  "border border-primary/30 bg-primary/10 text-primary",
              )}
            >
              <ShieldCheck className="h-5 w-5" />
              <span className={cn("flex-1 text-left", collapsed && "lg:hidden")}>
                {t("nav.admin")}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform",
                  adminOpen && "rotate-180",
                  collapsed && "lg:hidden",
                )}
              />
            </button>

            {adminOpen ? (
              <div className={cn("grid gap-2 pl-4", collapsed && "lg:pl-0")}>
                {adminNavigation.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname.startsWith(item.href);

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
              </div>
            ) : null}
          </div>
        ) : null}
      </nav>
    </aside>
    </>
  );
};
