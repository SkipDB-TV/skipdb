import type { Config } from "tailwindcss";

/**
 * SkipDB design language: a dark "playback timeline" aesthetic.
 * Base = deep indigo/violet ("midnight"), accent = neon "skip-forward" cyan,
 * with a warm amber for pending/review states.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        midnight: {
          950: "#0a0a14",
          900: "#0f0f1f",
          850: "#15152a",
          800: "#1b1b33",
          700: "#26264a",
          600: "#34345f",
          500: "#4a4a7a",
        },
        skip: {
          // neon skip-forward accent
          DEFAULT: "#2dd4bf",
          bright: "#5eead4",
          dim: "#0f766e",
        },
        signal: {
          // secondary accent (intro vs recap vs outro chips, links)
          DEFAULT: "#a78bfa",
          bright: "#c4b5fd",
        },
        warn: "#f59e0b",
        danger: "#f43f5e",
        ok: "#34d399",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(45,212,191,0.25), 0 8px 30px -8px rgba(45,212,191,0.35)",
        card: "0 10px 40px -20px rgba(0,0,0,0.8)",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(167,139,250,0.18), transparent 70%)",
      },
      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
