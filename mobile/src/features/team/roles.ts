import type { RoleValue } from "@contracts/enums";
import { color } from "@/ui/theme";

/** How each role reads and looks, matching the web team page. */
export const ROLE_LABEL: Record<RoleValue, { label: string; fg: string; bg: string }> = {
  OWNER: { label: "Owner", fg: "#6d28d9", bg: "#efe8fd" },
  ADMIN: { label: "Admin", fg: color.navy700, bg: "#e6efff" },
  WORKER: { label: "Worker", fg: color.teal700, bg: "#dff4f7" },
};

/**
 * A calendar date the server stored at midnight UTC (hire date, birthday) —
 * shown as that same date wherever the phone is, and as the "YYYY-MM-DD" the
 * form edits. Formatting only.
 */
export const dateOnly = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export function longDate(iso: string | null, timeZone = "UTC") {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
