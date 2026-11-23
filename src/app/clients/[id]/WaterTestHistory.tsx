import {
  READINGS,
  READING_KEYS,
  readingStatus,
  readingTarget,
  type ReadingKey,
  type WaterTestReading,
} from "@/contracts/waterTest";

/**
 * A pool's recent water tests, newest first. A value outside the target range
 * is marked with an arrow and a word as well as colour, so it doesn't depend
 * on seeing red. Dates are read in the business timezone, not the browser's.
 */
function Cell({ k, value }: { k: ReadingKey; value: number | null }) {
  if (value === null) return <span className="text-faint">—</span>;
  const status = readingStatus(k, value);
  if (status === "ok") return <span className="tabular-nums text-ink">{value}</span>;
  return (
    <span
      className="font-semibold tabular-nums text-danger"
      title={`${status === "low" ? "Low" : "High"}. Target ${readingTarget(k)}`}
    >
      {value} <span aria-hidden="true">{status === "low" ? "▼" : "▲"}</span>
      <span className="sr-only">{status === "low" ? "low" : "high"}</span>
    </span>
  );
}

export default function WaterTestHistory({
  readings,
  timeZone,
}: {
  readings: WaterTestReading[];
  timeZone: string;
}) {
  if (readings.length === 0) {
    return <p className="text-sm text-muted">No water tests recorded yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line/70 text-left text-[11px] uppercase tracking-wider text-faint">
            <th className="py-2 pr-3 font-semibold">Date</th>
            {READING_KEYS.map((k) => (
              <th key={k} className="px-3 py-2 text-right font-semibold">
                {READINGS[k].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line/60">
          {readings.map((r) => (
            <tr key={r.id}>
              <td className="py-2 pr-3 text-muted">
                {new Date(r.takenAt).toLocaleDateString("en-US", {
                  timeZone,
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </td>
              {READING_KEYS.map((k) => (
                <td key={k} className="px-3 py-2 text-right">
                  <Cell k={k} value={r[k]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
