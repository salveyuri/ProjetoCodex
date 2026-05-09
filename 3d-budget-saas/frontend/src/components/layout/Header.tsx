"use client";

import { Bell, Menu, Search, Sparkles } from "lucide-react";

interface HeaderProps {
  onToggleSidebar: () => void;
}

export const Header = ({ onToggleSidebar }: HeaderProps) => (
  <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
    <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6">
      <button
        type="button"
        title="Abrir menu"
        aria-label="Abrir menu"
        onClick={onToggleSidebar}
        className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-surface text-foreground transition hover:border-primary hover:text-primary lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden h-10 flex-1 items-center gap-3 rounded-lg border border-border bg-surface px-3 text-muted sm:flex">
        <Search className="h-4 w-4" />
        <input
          aria-label="Buscar"
          placeholder="Buscar orcamentos, materiais, clientes"
          className="h-full flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          title="Automacoes"
          aria-label="Automacoes"
          className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-surface text-secondary transition hover:border-secondary"
        >
          <Sparkles className="h-5 w-5" />
        </button>
        <button
          type="button"
          title="Notificacoes"
          aria-label="Notificacoes"
          className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-surface text-foreground transition hover:border-primary hover:text-primary"
        >
          <Bell className="h-5 w-5" />
        </button>
      </div>
    </div>
  </header>
);
