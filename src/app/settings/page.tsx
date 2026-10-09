import { getBusinessCatalog } from "@/server/services/catalogReads";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import DeleteButton from "@/components/DeleteButton";
import { ModalButton } from "@/components/Modal";
import { card } from "@/components/styles";

import { minToHHMM } from "@/lib/schedule";
import CatalogForm, { type Field } from "./CatalogForm";
import WorkHoursForm from "./WorkHoursForm";
import CompanyForm from "./CompanyForm";
import {
  saveService,
  deleteService,
  saveExtra,
  deleteExtra,
  saveTaxRate,
  toggleTaxRate,
} from "./actions";
import { requirePageSession } from "@/lib/guard";

// Read-first: a catalog is scanned far more often than it's edited, so a row
// shows the facts and keeps the form behind an Edit dialog.
function CatalogRow({
  name,
  detail,
  badge,
  action,
  id,
  fields,
  title,
  children,
}: {
  name: string;
  detail: string;
  badge?: React.ReactNode;
  action: Parameters<typeof CatalogForm>[0]["action"];
  id: string;
  fields: Field[];
  title: string;
  /** Row-level actions (delete / deactivate). */
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 py-3 last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ink">{name}</span>
          {badge}
        </div>
        <div className="text-[13px] tabular-nums text-muted">{detail}</div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <ModalButton
          label="Edit"
          title={title}
          icon={null}
          size="sm"
          className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-navy-700 transition hover:bg-chrome-100"
        >
          <CatalogForm
            action={action}
            id={id}
            submitLabel="Save changes"
            layout="stacked"
            fields={fields}
          />
        </ModalButton>
        {children}
      </div>
    </div>
  );
}

export default async function SettingsPage() {
  const session = await requirePageSession("ADMIN");

  const catalog = await getBusinessCatalog(session.user);
  if (!catalog.ok) throw new Error(catalog.error);
  const { services, extras, taxRates, hours, company } = catalog.data;

  const rowDelete =
    "rounded-full px-3 py-1.5 text-[13px] font-semibold text-faint transition hover:bg-danger/10 hover:text-danger";

  return (
    <AppShell role={session.user.role} name={session.user.name ?? ""}>
      <PageHeader
        title="Service"
        accent="settings"
        subtitle="Company details, business hours, and your catalog of services, add-ons, and tax rates."
      />

      <div className="space-y-6">
        {/* Company identity */}
        <section className={card}>
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-ink">Company details</h2>
            <p className="mt-0.5 text-sm text-muted">
              What every invoice and receipt prints about the business.
            </p>
          </div>
          <CompanyForm company={company} />
        </section>

        {/* Business hours */}
        <section className={card}>
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-ink">Business hours</h2>
            <p className="mt-0.5 text-sm text-muted">
              The timezone the business runs on, the window jobs can be
              scheduled in, and the hours the calendar shows.
            </p>
          </div>
          <WorkHoursForm
            start={minToHHMM(hours.startMin)}
            end={minToHHMM(hours.endMin)}
            timezone={hours.timezone}
          />
        </section>

        {/* Services */}
        <section className={card}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Services</h2>
            <ModalButton
              label="Add service"
              title="Add a service"
              subtitle="Sets the default price and duration when a job is scheduled."
              variant="ghost"
              size="sm"
            >
              <CatalogForm
                action={saveService}
                submitLabel="Add service"
                layout="stacked"
                fields={[
                  { name: "name", label: "Name", required: true },
                  { name: "basePrice", label: "Base $", type: "number", step: "0.01", required: true },
                  { name: "defaultDurationMin", label: "Minutes", type: "number", required: true },
                ]}
              />
            </ModalButton>
          </div>

          <div>
            {services.map((s) => (
              <CatalogRow
                key={s.id}
                name={s.name}
                detail={`$${s.basePrice} · ${s.defaultDurationMin} min`}
                title={`Edit ${s.name}`}
                action={saveService}
                id={s.id}
                fields={[
                  { name: "name", label: "Name", defaultValue: s.name, required: true },
                  { name: "basePrice", label: "Base $", type: "number", step: "0.01", defaultValue: s.basePrice },
                  { name: "defaultDurationMin", label: "Minutes", type: "number", defaultValue: s.defaultDurationMin },
                ]}
              >
                <DeleteButton
                  action={deleteService}
                  hidden={{ id: s.id }}
                  confirm={`Delete service "${s.name}"?`}
                  label="Delete"
                  className={rowDelete}
                />
              </CatalogRow>
            ))}
            {services.length === 0 && (
              <p className="py-3 text-sm text-muted">No services yet.</p>
            )}
          </div>
        </section>

        {/* Extra services */}
        <section className={card}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Extra services</h2>
            <ModalButton
              label="Add extra"
              title="Add an extra service"
              subtitle="Add-ons a worker can attach to a job."
              variant="ghost"
              size="sm"
            >
              <CatalogForm
                action={saveExtra}
                submitLabel="Add extra"
                layout="stacked"
                fields={[
                  { name: "name", label: "Name", required: true },
                  { name: "price", label: "Price $", type: "number", step: "0.01", required: true },
                ]}
              />
            </ModalButton>
          </div>

          <div>
            {extras.map((e) => (
              <CatalogRow
                key={e.id}
                name={e.name}
                detail={`$${e.price}`}
                title={`Edit ${e.name}`}
                action={saveExtra}
                id={e.id}
                fields={[
                  { name: "name", label: "Name", defaultValue: e.name, required: true },
                  { name: "price", label: "Price $", type: "number", step: "0.01", defaultValue: e.price },
                ]}
              >
                <DeleteButton
                  action={deleteExtra}
                  hidden={{ id: e.id }}
                  confirm={`Delete extra "${e.name}"?`}
                  label="Delete"
                  className={rowDelete}
                />
              </CatalogRow>
            ))}
            {extras.length === 0 && (
              <p className="py-3 text-sm text-muted">No extras yet.</p>
            )}
          </div>
        </section>

        {/* Tax rates */}
        <section className={card}>
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <h2 className="mb-1 text-lg font-semibold text-ink">Tax rates</h2>
              <p className="text-sm text-muted">
                Applied per-estimate — nothing is taxable by default. Rates are
                snapshotted when added to an estimate, so changes here never
                rewrite a signed estimate.
              </p>
            </div>
            <ModalButton
              label="Add rate"
              title="Add a tax rate"
              subtitle="Available to apply on estimates."
              variant="ghost"
              size="sm"
            >
              <CatalogForm
                action={saveTaxRate}
                submitLabel="Add tax rate"
                layout="stacked"
                fields={[
                  { name: "name", label: "Name", required: true },
                  { name: "rate", label: "Rate %", type: "number", step: "0.001", required: true },
                ]}
              />
            </ModalButton>
          </div>

          <div className="mt-3">
            {taxRates.map((t) => (
              <CatalogRow
                key={t.id}
                name={t.name}
                detail={`${t.rate}%`}
                badge={
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                      t.active ? "bg-good/10 text-good" : "bg-pending/10 text-pending"
                    }`}
                  >
                    {t.active ? "Active" : "Inactive"}
                  </span>
                }
                title={`Edit ${t.name}`}
                action={saveTaxRate}
                id={t.id}
                fields={[
                  { name: "name", label: "Name", defaultValue: t.name, required: true },
                  { name: "rate", label: "Rate %", type: "number", step: "0.001", defaultValue: t.rate },
                ]}
              >
                <DeleteButton
                  action={toggleTaxRate}
                  hidden={{ id: t.id }}
                  confirm={t.active ? `Deactivate "${t.name}"?` : `Reactivate "${t.name}"?`}
                  label={t.active ? "Deactivate" : "Reactivate"}
                  className={rowDelete}
                />
              </CatalogRow>
            ))}
            {taxRates.length === 0 && (
              <p className="py-3 text-sm text-muted">No tax rates yet.</p>
            )}
          </div>
        </section>
      </div>

      <p className="mt-4 text-xs text-faint">
        Materials have their own catalog under Materials.
      </p>
    </AppShell>
  );
}
