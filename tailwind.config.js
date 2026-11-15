/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // CuraPulse Design System v1
        brand: { DEFAULT: "#176B63", dark: "#0F524B", light: "#2A8379" },
        sage: { DEFAULT: "#DCEFE8", 50: "#F1F8F5", 100: "#E7F4EF", 200: "#DCEFE8", 300: "#B8E0D4", 400: "#8CCBB9", ink: "#145C55" },
        canvas: "#F7FAF8",
        ink: { DEFAULT: "#263746", muted: "#4F5F6A", soft: "#6B7A84" },
        line: { DEFAULT: "#DCE5E1", strong: "#C3D0CB" },
        mist: { DEFAULT: "#DDEAF3", 50: "#EEF4F9", ink: "#23476A", line: "#B9CFE2" },
        lav: { DEFAULT: "#EEE9F5", ink: "#5B3E8A", line: "#D6CAE8" },
        coral: { DEFAULT: "#C94C4C", dark: "#9A3030", tint: "#FBEAEA", line: "#E8A9A9" },
        caution: { DEFAULT: "#B7791F", ink: "#6E4A06", tint: "#FFF5DB", line: "#EACB7F" },
        // legacy tokens kept so older files still compile
        forest: { 950: "#0D221D", 900: "#132E27", 850: "#17372F", 800: "#1B3F36", 700: "#1E4B40", 600: "#176B63" },
        warmorange: { 50: "#FFF8F2", 100: "#FFEDD5", 200: "#FED7AA", 300: "#FDBA74", 400: "#FB923C", 500: "#F97316" },
        curacoral: "#C94C4C",
      },
      fontFamily: {
        ui: ["Figtree", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        brand: ["Fraunces", "Georgia", "ui-serif", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(38,55,70,0.04), 0 4px 16px -8px rgba(38,55,70,0.10)",
        frame: "0 30px 60px -20px rgba(38,55,70,0.35), 0 0 0 1px rgba(38,55,70,0.06)",
      },
    },
  },
  plugins: [],
};
