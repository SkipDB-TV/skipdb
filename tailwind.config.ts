import type { Config } from "tailwindcss";

/**
 * SkipDB design language: a dark "playback timeline" aesthetic.
 * Base = deep indigo/violet ("midnight"), accent = neon "skip-forward" cyan,
 * with a warm amber for pending/review states.
 *
 * Colors use CSS custom properties so they flip between light and dark without
 * touching individual component files. The <alpha-value> placeholder lets
 * Tailwind's opacity modifiers (e.g. bg-midnight-900/70) work correctly.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        midnight: {
          950: "rgb(var(--midnight-950) / <alpha-value>)",
          900: "rgb(var(--midnight-900) / <alpha-value>)",
          850: "rgb(var(--midnight-850) / <alpha-value>)",
          800: "rgb(var(--midnight-800) / <alpha-value>)",
          700: "rgb(var(--midnight-700) / <alpha-value>)",
          600: "rgb(var(--midnight-600) / <alpha-value>)",
          500: "rgb(var(--midnight-500) / <alpha-value>)",
        },
        // Override the slate shades used for UI text so they invert between
        // light and dark without requiring dark: prefixes on every JSX element.
        slate: {
          200: "rgb(var(--slate-200) / <alpha-value>)",
          300: "rgb(var(--slate-300) / <alpha-value>)",
          400: "rgb(var(--slate-400) / <alpha-value>)",
          500: "rgb(var(--slate-500) / <alpha-value>)",
          600: "rgb(var(--slate-600) / <alpha-value>)",
        },
        skip: {
          DEFAULT: "#2dd4bf",
          bright: "#5eead4",
          dim: "#0f766e",
        },
        signal: {
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
        card: "var(--shadow-card)",
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
