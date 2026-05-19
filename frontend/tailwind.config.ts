import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "SF Pro Display",
          "SF Pro Text",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        mono: ["SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      colors: {
        ink: "#101114",
        graphite: "#5f6673",
        mist: "#f6f7f9",
        glass: "rgba(255,255,255,0.68)",
        line: "rgba(17,24,39,0.09)",
        blueglass: "rgba(76, 129, 255, 0.12)",
      },
      boxShadow: {
        glass: "0 18px 60px rgba(15, 23, 42, 0.10)",
        soft: "0 8px 30px rgba(15, 23, 42, 0.08)",
      },
      backdropBlur: {
        glass: "28px",
      },
    },
  },
  plugins: [],
};

export default config;
