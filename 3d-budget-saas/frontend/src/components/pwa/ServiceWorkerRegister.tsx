"use client";

import { useEffect } from "react";

// Registers public/sw.js once the app mounts. Silently no-ops in
// environments without the API (older browsers, some in-app webviews)
// instead of throwing — this is a progressive enhancement (installability
// + an offline fallback page), never something the app depends on to
// function.
export const ServiceWorkerRegister = () => {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  return null;
};
