import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "3D Budget SaaS",
  description: "Budgeting console for 3D printing services.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

