import type { Config } from "tailwindcss";

const config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#080A0F",
        foreground: "#E6EDF7",
        surface: "#121722",
        "surface-muted": "#1A2030",
        border: "#273044",
        muted: "#8A96AA",
        primary: {
          DEFAULT: "#00D4FF",
          foreground: "#001018",
        },
        secondary: {
          DEFAULT: "#9EFF7A",
          foreground: "#061300",
        },
        accent: {
          DEFAULT: "#FFB86B",
          foreground: "#1B0D00",
        },
        danger: {
          DEFAULT: "#FF5C7A",
          foreground: "#210008",
        },
      },
      boxShadow: {
        panel: "0 18px 60px rgba(0, 0, 0, 0.32)",
      },
      backgroundImage: {
        circuit:
          "linear-gradient(rgba(0, 212, 255, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(158, 255, 122, 0.06) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;

