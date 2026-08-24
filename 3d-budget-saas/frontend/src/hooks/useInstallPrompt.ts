"use client";

import { useCallback, useEffect, useState } from "react";

// Não declarado no lib.dom.d.ts do TypeScript ainda (evento não-padrão do
// Chromium) — https://developer.mozilla.org/docs/Web/API/BeforeInstallPromptEvent
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Expõe o evento beforeinstallprompt do Chrome como um botão "Instalar
// app" dentro da UI, em vez de depender do usuário achar sozinho o menu
// nativo do navegador. O evento só dispara quando o Chrome já considera o
// PWA instalável (manifest + service worker + HTTPS) E o app ainda não
// está instalado — por isso `canInstall` começa false e só vira true se o
// evento realmente chegar.
export const useInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    // O evento só dispara uma vez por prompt — precisa esperar o Chrome
    // disparar beforeinstallprompt de novo (não acontece se o usuário
    // aceitou, e vira responsabilidade do appinstalled acima).
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  return { canInstall: deferredPrompt !== null, promptInstall };
};
