import type { Config } from "tailwindcss";

// Palette matched to the reference design: a vivid royal blue for nav and
// primary surfaces, a warm gold for call-to-action pills, and a near-black
// for dark feature sections. High-contrast on purpose — read outdoors, on a
// phone, in direct sun. (The `navy` token name is kept for continuity even
// though the blue is now brighter than a true navy.)
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          900: "#0b2a63", // deep royal — text on gold, active pill text, dark accents
          700: "#1a56db", // primary royal blue — nav strip, links, focus
          500: "#3f74e3", // lighter royal — hovers
        },
        chrome: {
          400: "#8fb2f5",
          100: "#e9f1ff", // light blue tint — subtle panels
        },
        // Cyan-teal accent — the brand's signature colour, matching the
        // reference hero's "Your Perfect Pool" wordmark and its "Start Your
        // Project" pill. Now the primary call-to-action colour.
        //   700 is the deepest that still reads AA against white text (white on
        //   700 = 5.36:1); 500/400/300 are for accents/glows on DARK surfaces
        //   only — they fail as text on white, so never use them for copy.
        teal: {
          900: "#06414a", // text on a bright-teal chip
          800: "#0a5f77", // CTA hover
          700: "#0e7490", // primary CTA base — white text passes AA (5.36:1)
          500: "#14b8c9", // bright accent on dark (nav glow, active marks)
          400: "#3dd0de", // hero glow
          300: "#8fe3ec", // faint teal wash
        },
        // Gold — kept for continuity (a few warm highlights) but no longer the
        // primary CTA; teal now leads.
        gold: {
          600: "#de911d",
          500: "#f0b429",
          400: "#f7c948",
        },
        // Near-black used for dark feature sections and the cinematic nav band.
        night: "#0f1622",
        surface: "#f4f7fc",

        // --- Text scale -----------------------------------------------
        // Solid values, not opacity over white: `text-ink/55` measured only
        // 3.66:1 and `/35` just 2.12:1, well under the 4.5:1 AA floor. This
        // app is read on a phone in direct sun, so every level must pass.
        ink: "#1a2333", // body — 15.76:1
        muted: "#5b6784", // secondary text — 5.65:1
        faint: "#63708c", // tertiary text / placeholders — 4.97:1

        // --- Borders ---------------------------------------------------
        line: "#dbe3ee", // decorative dividers and card edges
        field: "#7a8cae", // input borders — 3.39:1, meets the 3:1 rule for
        // UI component boundaries (plain `line` was 1.29:1: invisible)

        // --- Semantic --------------------------------------------------
        // Gold (42deg) is the primary CTA, so amber "warn" (26deg) sat only
        // 16deg away — "press this" and "careful" looked alike. Amber is now
        // reserved for things that are actually wrong; the merely-not-yet
        // states get their own hues, far from gold.
        warn: "#b45309", // genuinely needs attention (low stock)
        pending: "#475569", // not yet done — 6.53:1, 173deg from gold
        aqua: "#0e7490", // work in progress — 5.36:1, 150deg from gold
        danger: "#b91c1c",
        good: "#166534",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
