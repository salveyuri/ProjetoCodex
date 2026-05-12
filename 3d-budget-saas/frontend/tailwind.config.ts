import type { Config } from "tailwindcss";

const config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#09090B",
        foreground: "#F4F4F5",
        surface: "#18181B",
        "surface-muted": "#27272A",
        border: "#3F3F46",
        muted: "#A1A1AA",
        primary: {
          DEFAULT: "#818CF8",
          foreground: "#111827",
        },
        secondary: {
          DEFAULT: "#34D399",
          foreground: "#052E1A",
        },
        accent: {
          DEFAULT: "#FBBF24",
          foreground: "#1C1603",
        },
        danger: {
          DEFAULT: "#FB7185",
          foreground: "#2B0710",
        },
      },
      boxShadow: {
        panel: "0 18px 60px rgba(0, 0, 0, 0.28)",
      },
      backgroundImage: {
        circuit:
          "linear-gradient(rgba(129, 140, 248, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(52, 211, 153, 0.05) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;
