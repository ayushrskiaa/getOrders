import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#151716",
        ledger: "#F7F4EC",
        line: "#DED7C6",
        mint: "#7BDCB5",
        coral: "#E56F51",
        cobalt: "#2B55D9",
        receipt: "#FFFDFC"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      }
    }
  },
  plugins: []
};

export default config;
