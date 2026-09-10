export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          950: "#070b14",
          900: "#0b1220",
          850: "#0e1628",
          800: "#131c31",
          700: "#1b2740",
          600: "#24334f",
        },
        accent: {
          DEFAULT: "#38bdf8",
          dim: "#0ea5e9",
          soft: "#7dd3fc",
        },
        status: {
          danger: { DEFAULT: "#ef4444", soft: "rgba(239,68,68,0.12)" },
          warn: { DEFAULT: "#f59e0b", soft: "rgba(245,158,11,0.12)" },
          ok: { DEFAULT: "#10b981", soft: "rgba(16,185,129,0.12)" },
          info: { DEFAULT: "#22d3ee", soft: "rgba(34,211,238,0.12)" },
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 2px rgba(0,0,0,0.45), 0 10px 28px rgba(2,6,23,0.35)",
        lift: "0 1px 2px rgba(0,0,0,0.5), 0 16px 40px rgba(2,6,23,0.55)",
        focus: "0 0 0 3px rgba(56,189,248,0.28)",
      },
      borderRadius: {
        xl2: "1rem",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        shimmer: {
          from: { backgroundPosition: "-400px 0" },
          to: { backgroundPosition: "400px 0" },
        },
        "dash-flow": {
          to: { strokeDashoffset: "-24" },
        },
        "spin-slow": {
          to: { transform: "rotate(360deg)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out both",
        "fade-in-up": "fade-in-up 0.45s cubic-bezier(0.16,1,0.3,1) both",
        "pulse-dot": "pulse-dot 1.8s ease-in-out infinite",
        shimmer: "shimmer 1.4s linear infinite",
        "dash-flow": "dash-flow 1.2s linear infinite",
        "spin-slow": "spin-slow 2.4s linear infinite",
      },
    },
  },
  plugins: [],
};