// One page title treatment for the whole app: a two-tone heading, an optional
// subtitle, and an optional action on the right. Pages were drifting between
// text-xl/semibold and text-2xl/bold with and without subtitles.
export default function PageHeader({
  title,
  accent,
  subtitle,
  action,
}: {
  title: string;
  /** Second half of the heading, rendered in brand blue. */
  accent?: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold leading-tight text-ink">
          {title}
          {accent && <> <span className="accent">{accent}</span></>}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
