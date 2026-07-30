import type { TaskStatus } from "@prisma/client";

// Amber is reserved for things that are actually wrong. "In progress" and
// "Submitted" aren't problems, so they no longer borrow the warning colour
// (which also sat only 16deg from the gold CTA and read as a button).
const STYLES: Record<TaskStatus, { label: string; className: string }> = {
  SCHEDULED: { label: "Scheduled", className: "bg-navy-500/10 text-navy-700" },
  IN_PROGRESS: { label: "In progress", className: "bg-aqua/10 text-aqua" },
  SUBMITTED: { label: "Submitted", className: "bg-pending/10 text-pending" },
  APPROVED: { label: "Approved", className: "bg-good/10 text-good" },
  FLAGGED: { label: "Flagged", className: "bg-danger/10 text-danger" },
  CANCELLED: { label: "Cancelled", className: "bg-ink/5 text-faint" },
};

export default function StatusBadge({ status }: { status: TaskStatus }) {
  const s = STYLES[status];
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${s.className}`}
    >
      {s.label}
    </span>
  );
}
