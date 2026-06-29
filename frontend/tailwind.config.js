/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Dark espresso theme
        espresso: {
          bg: "#0F0A06", // near-black coffee-dark (primary bg)
          card: "#1A1108", // dark roast (card bg)
          border: "#2A1F12", // dark border
        },
        crema: "#C8893A", // golden amber — coffee crema (accent)
        sage: "#6B9E6B", // sage green — positive metrics
        cream: "#F5EDD6", // warm cream (text primary)
        tan: "#A89880", // muted tan (text secondary)
        alert: "#E05252", // alert red
        success: "#52A152", // success green
      },
      fontFamily: {
        sans: ["'DM Sans'", "system-ui", "sans-serif"],
        mono: ["'DM Mono'", "ui-monospace", "monospace"],
      },
      keyframes: {
        "live-ping": {
          "0%": { transform: "scale(1)", opacity: "0.7" },
          "75%, 100%": { transform: "scale(2.4)", opacity: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "live-ping": "live-ping 1.6s cubic-bezier(0, 0, 0.2, 1) infinite",
        "fade-in": "fade-in 0.35s ease-out both",
      },
    },
  },
  plugins: [],
};
