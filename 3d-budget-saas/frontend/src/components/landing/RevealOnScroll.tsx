"use client";

import { useEffect } from "react";

// Mirrors the vanilla-JS behavior from the original landing mockup, but
// drives it off `data-*` attributes instead of CSS class names — the
// page's styles come from a CSS Module (landing.module.css), whose class
// names get hashed at build time, so plain strings like "reveal" would
// never match. Sets inline styles directly instead of toggling a class for
// the same reason (there's no build-time-safe way to reference the
// module's hashed `.reveal.in` state from here).
export function RevealOnScroll() {
  useEffect(() => {
    const revealEls = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            el.style.opacity = "1";
            el.style.transform = "translateY(0)";
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    revealEls.forEach((el) => io.observe(el));

    // Restart the hero calc widget's entrance animation for the "live" feel.
    document.querySelectorAll<HTMLElement>("[data-calc-anim]").forEach((el) => {
      el.style.animationPlayState = "running";
    });

    return () => io.disconnect();
  }, []);

  return null;
}
