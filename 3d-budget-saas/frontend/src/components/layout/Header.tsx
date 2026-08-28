"use client";

import { Download, LogOut, Menu, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

interface HeaderProps {
  onToggleSidebar: () => void;
}

export const Header = ({ onToggleSidebar }: HeaderProps) => {
  const router = useRouter();
  const { logout } = useAuth();
  const { t } = useLanguage();
  const { canInstall, promptInstall } = useInstallPrompt();

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          title={t("nav.openMenu")}
          aria-label={t("nav.openMenu")}
          onClick={onToggleSidebar}
          className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-surface text-foreground transition hover:border-primary hover:text-primary lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="hidden h-10 flex-1 items-center gap-3 rounded-lg border border-border bg-surface px-3 text-muted sm:flex">
          <Search className="h-4 w-4" />
          <input
            aria-label={t("common.search")}
            placeholder={t("header.search")}
            className="h-full flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {canInstall ? (
            <button
              type="button"
              title={t("header.installApp")}
              aria-label={t("header.installApp")}
              onClick={promptInstall}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted transition hover:border-primary hover:text-primary"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">{t("header.installApp")}</span>
            </button>
          ) : null}
          <button
            type="button"
            title={t("header.logout")}
            aria-label={t("header.logout")}
            onClick={handleLogout}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted transition hover:border-danger hover:text-danger"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">{t("header.logout")}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
