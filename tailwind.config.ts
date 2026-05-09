import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#080b0f",
        panel: "#10161d",
        panelSoft: "#151d26",
        line: "#27313c",
        mint: "#52e6c7",
        amber: "#f6b44b",
        coral: "#ff7666",
      },
      boxShadow: {
        glow: "0 20px 60px rgba(82, 230, 199, 0.12)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};

export default config;
