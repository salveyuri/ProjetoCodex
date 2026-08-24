import type { MetadataRoute } from "next";

// Served automatically at /manifest.webmanifest and linked in <head> — no
// wiring needed in layout.tsx for this part. Lets Chrome on Android (and
// desktop) offer "Install app": standalone window, own icon, no address
// bar. See Contextos/Decisoes.md for why this is a hand-rolled PWA setup
// instead of a native app or a caching library.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pricify3D",
    short_name: "Pricify3D",
    description: "Precificação e orçamentos para impressão 3D.",
    // The real "app" screen — unauthenticated visitors are already
    // redirected to /login client-side (AuthContext), no extra logic
    // needed here.
    start_url: "/dashboard",
    id: "/dashboard",
    display: "standalone",
    // Matches body{background} in globals.css and the `background` token
    // in tailwind.config.ts — this app is dark-first by design.
    background_color: "#09090B",
    theme_color: "#09090B",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
