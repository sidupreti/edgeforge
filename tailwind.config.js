/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Landing-page design system
        "sf-black":      "#0a0a0a",
        "sf-near-black": "#141414",
        "sf-white":      "#ffffff",
        "sf-off-white":  "#f8f7f3",
        "sf-paper":      "#fbfaf6",
        "sf-gray-100":   "#ebeae5",
        "sf-gray-200":   "#d8d7d0",
        "sf-gray-300":   "#b0afa8",
        "sf-gray-400":   "#8a8982",
        "sf-gray-500":   "#6b6a63",
        // accent = black for all UI chrome (buttons, borders, focus rings)
        // data-viz colors are hardcoded inline in screen components — unchanged
        accent:          "#0a0a0a",
        "accent-dark":   "#141414",
      },
      fontFamily: {
        sans:    ["'DM Sans'", "system-ui", "sans-serif"],
        display: ["'Syne'",   "system-ui", "sans-serif"],
        mono:    ["'DM Mono'", "'JetBrains Mono'", "'Courier New'", "monospace"],
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
        "bubble-in":      "bubble-in 0.45s cubic-bezier(0.34,1.56,0.64,1) both",
        "underline-grow": "underline-grow 0.6s ease-out both",
        "fade-up":        "fade-up 0.5s ease-out both",
        "pulse-dot":      "pulse-dot 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
