import { labelClass } from "./styles";
import { Icon, type IconName } from "./icons";

// A labeled form control: label (+ required marker), the control itself, and
// an optional hint line. Presentational only, so it works inside client or
// server components.
export function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-faint">{hint}</p>}
    </div>
  );
}

// A titled form section with an icon chip, used to break long forms into
// scannable groups.
export function FormSection({
  icon,
  title,
  description,
  children,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-start gap-3">
        {icon && (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-chrome-100 text-navy-700">
            <Icon name={icon} size={18} />
          </span>
        )}
        <div>
          <h3 className="font-semibold leading-tight text-ink">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
