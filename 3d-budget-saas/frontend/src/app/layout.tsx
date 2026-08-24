import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pricify3D",
  description: "Budgeting console for 3D printing services.",
  icons: {
    icon: "/logo_icon.webp",
    apple: "/icons/apple-touch-icon.png",
  },
  // iOS-only: makes "Adicionar à Tela de Início" open standalone (no
  // Safari chrome) — Android/Chrome gets this from manifest.ts instead.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pricify3D",
  },
};

// themeColor moved out of `metadata` into its own export in Next 14+.
// Matches manifest.ts's background_color/theme_color.
export const viewport: Viewport = {
  themeColor: "#09090B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <ServiceWorkerRegister />
        <AuthProvider>
          <LanguageProvider>{children}</LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
