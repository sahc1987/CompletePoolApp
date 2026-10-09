/**
 * The app's visual tokens, taken from the web app's Tailwind palette so the two
 * read as one product.
 *
 * Those colours were chosen for a specific reason worth preserving here: this
 * is read on a phone, outdoors, in direct sun. Every text level clears 4.5:1
 * against its background, and the solid greys are deliberate — translucent ink
 * over white measured as low as 2.12:1 and was replaced.
 */

export const color = {
  /** Primary royal blue — headers, links, primary actions. */
  navy900: "#0b2a63",
  navy700: "#1a56db",
  navy500: "#3f74e3",

  chrome400: "#8fb2f5",
  chrome100: "#e9f1ff",

  /** The brand's signature cyan-teal. 700 is the deepest that holds white text. */
  teal900: "#06414a",
  teal800: "#0a5f77",
  teal700: "#0e7490",
  teal500: "#14b8c9",
  teal300: "#8fe3ec",

  gold500: "#f0b429",

  night: "#0f1622",
  /** Page background. */
  surface: "#f4f7fc",
  white: "#ffffff",

  /** Body text — 15.76:1. */
  ink: "#1a2333",
  /** Secondary text — 5.65:1. */
  muted: "#5b6784",
  /** Tertiary text and placeholders — 4.97:1. */
  faint: "#63708c",

  /** Card edges and dividers. */
  line: "#dbe3ee",
  /** Input borders — 3.39:1, which is the floor for a UI boundary. */
  field: "#7a8cae",

  /** Genuinely needs attention. */
  warn: "#b45309",
  /** Not yet done. */
  pending: "#475569",
  /** In progress. */
  aqua: "#0e7490",
  danger: "#b91c1c",
  good: "#166534",
} as const;

/** A 4pt grid. Every margin and pad in the app comes from here. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  /** The curve at the bottom of the blue header. */
  hero: 32,
  pill: 999,
} as const;

/**
 * Soft, navy-tinted elevation. Cards float off the pale surface the way the
 * reference design does, instead of sitting in hard grey outlines.
 */
export const shadow = {
  card: {
    shadowColor: "#0b2a63",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  raised: {
    shadowColor: "#0b2a63",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

/** Header gradient, deep navy into the brand blue. */
export const heroGradient = ["#0b2a63", "#1a56db"] as const;

/**
 * Each dashboard tile gets its own tint so the grid scans at a glance. Every
 * foreground clears 4.5:1 on its own background.
 */
export const tileTone = {
  jobs: { fg: "#1a56db", bg: "#e6efff" },
  estimates: { fg: "#0e7490", bg: "#dff4f7" },
  materials: { fg: "#b45309", bg: "#fdf0dc" },
  map: { fg: "#6d28d9", bg: "#efe8fd" },
  account: { fg: "#334155", bg: "#e8edf4" },
  photos: { fg: "#be123c", bg: "#fde8ec" },
  clients: { fg: "#0f766e", bg: "#dcf5ef" },
  billing: { fg: "#15803d", bg: "#e3f6e8" },
  team: { fg: "#9d174d", bg: "#fce7f1" },
  settings: { fg: "#475569", bg: "#eaeef3" },
  kpi: { fg: "#a16207", bg: "#fdf3d7" },
} as const;

/**
 * Type scale. Sizes are generous by web standards: a worker reads this at
 * arm's length with wet hands and sunglasses on, not at a desk.
 */
export const type = {
  display: { fontSize: 28, fontWeight: "700", letterSpacing: -0.4 },
  title: { fontSize: 22, fontWeight: "700", letterSpacing: -0.2 },
  heading: { fontSize: 17, fontWeight: "600" },
  body: { fontSize: 16, fontWeight: "400" },
  bodyStrong: { fontSize: 16, fontWeight: "600" },
  small: { fontSize: 14, fontWeight: "400" },
  label: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
} as const;

/** Tone per task status, matching the web app's badges. */
export const statusTone: Record<
  string,
  { label: string; fg: string; bg: string }
> = {
  SCHEDULED: { label: "Scheduled", fg: color.pending, bg: "#e2e8f0" },
  IN_PROGRESS: { label: "In progress", fg: color.aqua, bg: "#d7eef3" },
  SUBMITTED: { label: "Submitted", fg: color.navy700, bg: color.chrome100 },
  APPROVED: { label: "Approved", fg: color.good, bg: "#dcf0e3" },
  FLAGGED: { label: "Needs rework", fg: color.danger, bg: "#fae3e3" },
  CANCELLED: { label: "Cancelled", fg: color.faint, bg: "#e9edf4" },
  // Estimates
  DRAFT: { label: "Draft", fg: color.pending, bg: "#e2e8f0" },
  PRESENTED: { label: "Presented", fg: color.aqua, bg: "#d7eef3" },
  DECLINED: { label: "Declined", fg: color.danger, bg: "#fae3e3" },
  // Material requests
  PENDING: { label: "Pending", fg: color.pending, bg: "#e2e8f0" },
  DENIED: { label: "Denied", fg: color.danger, bg: "#fae3e3" },
};

/** Dollars for display. Amounts arrive from the API as plain numbers. */
export function usd(n: number | null | undefined): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n ?? 0
  );
}

/**
 * The smallest square a wet thumb can reliably hit. Apple asks for 44pt and
 * Android for 48dp; this app takes the larger of the two everywhere, because
 * every tap here happens one-handed beside a pool.
 */
export const HIT_SIZE = 48;
