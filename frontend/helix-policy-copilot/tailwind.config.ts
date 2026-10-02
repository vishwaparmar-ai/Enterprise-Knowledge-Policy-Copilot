import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#2563EB", dark: "#1E3A8A" },
        navy: "#0F172A",
        canvas: "#F8FAFC",
        line: "#E2E8F0",
        ink: "#0F172A",
        muted: "#64748B",
        success: "#16A34A",
        danger: "#DC2626",
      },
      fontFamily: { sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"] },
      boxShadow: {
        card: "0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px -6px rgb(15 23 42 / 0.08)",
        btn: "0 1px 2px rgb(15 23 42 / 0.12)",
      },
    },
  },
  plugins: [],
};
export default config;
