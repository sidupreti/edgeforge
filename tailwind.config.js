/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "#1D9E75",
        "accent-dark": "#16866A",
        navy: "#080d1a",
        "navy-light": "#0d1526",
        "navy-border": "rgba(29,158,117,0.15)",
      },
      fontFamily: {
        sans:    ["Inter", "system-ui", "sans-serif"],
        display: ["'Plus Jakarta Sans'", "Inter", "system-ui", "sans-serif"],
        mono:    ["'JetBrains Mono'", "'Courier New'", "Courier", "monospace"],
      },
      backgroundImage: {
        "accent-gradient": "linear-gradient(135deg, #1D9E75 0%, #16866A 100%)",
      },
      boxShadow: {
        "accent-glow": "0 0 20px rgba(29,158,117,0.35), 0 4px 12px rgba(0,0,0,0.4)",
        "accent-glow-sm": "0 0 10px rgba(29,158,117,0.2)",
        "card": "0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)",
      },
      keyframes: {
        "bubble-in": {
          "0%":   { opacity: "0", transform: "translateX(-24px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "underline-grow": {
          "0%":   { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
        "fade-up": {
          "0%":   { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "0.4" },
          "50%":      { opacity: "1" },
        },
      },
      animation: {
        "bubble-in":     "bubble-in 0.45s cubic-bezier(0.34,1.56,0.64,1) both",
        "underline-grow":"underline-grow 0.6s ease-out both",
        "fade-up":       "fade-up 0.5s ease-out both",
        "pulse-dot":     "pulse-dot 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
}

