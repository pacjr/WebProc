import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "./node_modules/@insight/product-login-system/src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        gold: {
          DEFAULT: "hsl(var(--gold))",
          muted: "hsl(var(--gold-muted))",
        },
        brand: {
          primary: "hsl(var(--brand-primary) / <alpha-value>)",
          "primary-hover": "hsl(var(--brand-primary-hover) / <alpha-value>)",
          foreground: "hsl(var(--brand-foreground) / <alpha-value>)",
          "foreground-muted": "hsl(var(--brand-foreground-muted) / <alpha-value>)",
          border: "hsl(var(--brand-border) / <alpha-value>)",
          background: "hsl(var(--brand-background) / <alpha-value>)",
          "background-secondary": "hsl(var(--brand-background-secondary) / <alpha-value>)",
          surface: "hsl(var(--brand-surface) / <alpha-value>)",
          info: "hsl(var(--brand-info) / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      spacing: {
        "space-8": "0.5rem",
        "space-10": "0.625rem",
        "space-12": "0.75rem",
        "space-16": "1rem",
        "space-20": "1.25rem",
        "space-24": "1.5rem",
        "space-28": "1.75rem",
        "space-32": "2rem",
        "space-40": "2.5rem",
      },
      fontSize: {
        display: ["2.25rem", { lineHeight: "2.75rem", fontWeight: "700" }],
        heading: ["1.875rem", { lineHeight: "2.25rem", fontWeight: "600" }],
        title: ["1.25rem", { lineHeight: "1.75rem", fontWeight: "600" }],
        subtitle: ["1.0625rem", { lineHeight: "1.5rem", fontWeight: "500" }],
        body: ["0.9375rem", { lineHeight: "1.5rem" }],
        caption: ["0.8125rem", { lineHeight: "1.25rem" }],
        label: ["0.6875rem", { lineHeight: "1rem", fontWeight: "500" }],
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
