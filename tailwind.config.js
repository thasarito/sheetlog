import safeArea from "tailwindcss-safe-area";

const color = (name) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: color("background"),
        foreground: color("foreground"),
        surface: {
          DEFAULT: color("surface"),
          2: color("surface-2"),
          3: color("surface-3"),
        },
        card: {
          DEFAULT: color("card"),
          foreground: color("card-foreground"),
        },
        muted: {
          DEFAULT: color("muted"),
          foreground: color("muted-foreground"),
        },
        primary: {
          DEFAULT: color("primary"),
          foreground: color("primary-foreground"),
        },
        accent: {
          DEFAULT: color("accent"),
          foreground: color("accent-foreground"),
        },
        info: {
          DEFAULT: color("info"),
          foreground: color("info-foreground"),
        },
        success: {
          DEFAULT: color("success"),
          foreground: color("success-foreground"),
        },
        warning: {
          DEFAULT: color("warning"),
          foreground: color("warning-foreground"),
        },
        danger: {
          DEFAULT: color("danger"),
          foreground: color("danger-foreground"),
        },
        // Compatibility aliases for existing shadcn-style utilities.
        destructive: {
          DEFAULT: color("danger"),
          foreground: color("danger-foreground"),
        },
        secondary: {
          DEFAULT: color("surface-2"),
          foreground: color("foreground"),
        },
        chart: {
          1: color("chart-1"),
          2: color("chart-2"),
          3: color("chart-3"),
          4: color("chart-4"),
          5: color("chart-5"),
        },
        brand: {
          sheets: color("brand-google-sheets"),
          "sheets-dark": color("brand-google-sheets-dark"),
          "google-blue": color("brand-google-blue"),
        },
        overlay: color("overlay"),
        border: color("border"),
        ring: color("ring"),
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        lift: "var(--shadow-lift)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [safeArea],
};
