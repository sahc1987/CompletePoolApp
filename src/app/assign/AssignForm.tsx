"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { createTask } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { Field, FormSection } from "@/components/Field";
import { inputClass, selectClass, labelClass } from "@/components/styles";
import AddressMap from "@/components/AddressMap";
import { useActionToast } from "@/components/Toast";
import type { ActionState } from "@/lib/actions";

type Client = { id: string; name: string; pools: { id: string; address: string }[] };
type Worker = { id: string; name: string };
type Service = { id: string; name: string; basePrice: number; defaultDurationMin: number };
type Extra = { id: string; name: string; price: number };

const chipClass =
  "flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3.5 py-2 text-sm font-medium text-ink transition hover:border-navy-500/40 has-[:checked]:border-navy-700 has-[:checked]:bg-chrome-100 has-[:checked]:text-navy-900";

export default function AssignForm({
  clients,
  workers,
  services,
  extras,
  workStart,
  workEnd,
}: {
  clients: Client[];
  workers: Worker[];
  services: Service[];
  extras: Extra[];
  /** Business hours as "HH:MM", used to bound the time picker. */
  workStart: string;
  workEnd: string;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(createTask, null);
  // Success here redirects to the calendar, so in practice this surfaces errors.
  useActionToast(state, { success: "Job scheduled." });
  const [clientId, setClientId] = useState("");
  const [poolId, setPoolId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");
  const [repeat, setRepeat] = useState("NONE");

  const showDays = repeat === "WEEKLY" || repeat === "BIWEEKLY";
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const pools = useMemo(
    () => clients.find((c) => c.id === clientId)?.pools ?? [],
    [clients, clientId]
  );
  const serviceName = services.find((s) => s.id === serviceId)?.name;

  // The pool is the service location, so its address is what gets mapped.
  const selectedAddress = pools.find((p) => p.id === poolId)?.address ?? "";

  function onClientChange(id: string) {
    setClientId(id);
    setPoolId(""); // the previous pool belongs to the previous client
  }

  function onServiceChange(id: string) {
    setServiceId(id);
    const svc = services.find((s) => s.id === id);
    if (svc) {
      setPrice(String(svc.basePrice));
      setDuration(String(svc.defaultDurationMin));
    }
  }

  return (
    <form action={formAction} className="divide-y divide-line">
      {/* Job details */}
      <div className="pb-6">
        <FormSection
          icon="clipboard"
          title="Job details"
          description="Who the job is for and what's being done."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Client" htmlFor="clientId" required>
              <select
                id="clientId"
                name="clientId"
                required
                className={selectClass}
                value={clientId}
                onChange={(e) => onClientChange(e.target.value)}
              >
                <option value="">Select a client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Pool" htmlFor="poolId" required hint={!clientId ? "Pick a client to see their pools." : undefined}>
              <select
                id="poolId"
                name="poolId"
                required
                className={selectClass}
                disabled={!clientId}
                value={poolId}
                onChange={(e) => setPoolId(e.target.value)}
              >
                <option value="">{clientId ? "Select a pool…" : "—"}</option>
                {pools.map((p) => (
                  <option key={p.id} value={p.id}>{p.address}</option>
                ))}
              </select>
            </Field>

            <Field label="Worker" htmlFor="workerId" required>
              <select id="workerId" name="workerId" required className={selectClass}>
                <option value="">Assign a worker…</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Service" htmlFor="serviceId" required hint="Sets the default price and duration.">
              <select
                id="serviceId"
                name="serviceId"
                required
                className={selectClass}
                value={serviceId}
                onChange={(e) => onServiceChange(e.target.value)}
              >
                <option value="">Select a service…</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
          </div>

          {selectedAddress && (
            <div className="mt-5">
              <AddressMap address={selectedAddress} />
            </div>
          )}
        </FormSection>
      </div>

      {/* Schedule */}
      <div className="py-6">
        <FormSection icon="calendar" title="Schedule & price" description="When it happens and what it costs.">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Date" htmlFor="date" required>
              <input id="date" name="date" type="date" required className={inputClass} />
            </Field>
            <Field
              label="Start time"
              htmlFor="time"
              required
              hint={`Open ${workStart}–${workEnd}`}
            >
              <input
                id="time"
                name="time"
                type="time"
                required
                min={workStart}
                max={workEnd}
                className={inputClass}
              />
            </Field>
            <Field label="Duration (min)" htmlFor="durationMin" required>
              <input
                id="durationMin"
                name="durationMin"
                type="number"
                min={1}
                required
                className={inputClass}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </Field>
            <Field label="Price ($)" htmlFor="price" required>
              <input
                id="price"
                name="price"
                type="number"
                step="0.01"
                min={0}
                required
                className={inputClass}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </Field>
          </div>
        </FormSection>
      </div>

      {/* Extras */}
      {extras.length > 0 && (
        <div className="py-6">
          <FormSection icon="box" title="Add-ons" description="Optional extras billed on top of the service.">
            <div className="flex flex-wrap gap-2.5">
              {extras.map((e) => (
                <label key={e.id} className={chipClass}>
                  <input type="checkbox" name="extras" value={e.id} className="h-4 w-4" />
                  {e.name}
                  <span className="text-faint">+${e.price}</span>
                </label>
              ))}
            </div>
          </FormSection>
        </div>
      )}

      {/* Notes */}
      <div className="py-6">
        <Field label="Notes" htmlFor="notes" hint="Anything the worker should know before arriving.">
          <textarea id="notes" name="notes" rows={2} className={inputClass} placeholder="Gate code, dog on site, access notes…" />
        </Field>
      </div>

      {/* Recurrence */}
      <div className="py-6">
        <FormSection icon="calendar" title="Repeat" description="Turn this into a recurring job.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Frequency" htmlFor="repeat">
              <select
                id="repeat"
                name="repeat"
                className={selectClass}
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
              >
                <option value="NONE">One-time</option>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Every 2 weeks</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </Field>
            {repeat !== "NONE" && (
              <Field label="Repeat until" htmlFor="repeatEndDate" hint="Leave blank for no end date.">
                <input id="repeatEndDate" name="repeatEndDate" type="date" className={inputClass} />
              </Field>
            )}
          </div>
          {showDays && (
            <div className="mt-4">
              <span className={labelClass}>On days</span>
              <div className="flex flex-wrap gap-2">
                {DOW.map((d, i) => (
                  <label key={d} className={chipClass}>
                    <input type="checkbox" name="daysOfWeek" value={i} className="h-4 w-4" />
                    {d}
                  </label>
                ))}
              </div>
            </div>
          )}
          {repeat !== "NONE" && (
            <p className="mt-3 rounded-lg bg-chrome-100 px-3 py-2 text-xs text-navy-700">
              Future dates are generated for the next 30 days and topped up over time.
            </p>
          )}
        </FormSection>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
        <p className="text-sm text-muted">
          {serviceName ? (
            <>Scheduling <span className="font-semibold text-ink">{serviceName}</span>{price && <> · <span className="font-semibold text-ink">${price}</span></>}</>
          ) : (
            "Fill in the details above to schedule."
          )}
        </p>
        <div className="flex items-center gap-3">
          {state?.error && <p className="text-sm text-danger">{state.error}</p>}
          <SubmitButton pendingLabel="Scheduling…">Schedule task</SubmitButton>
        </div>
      </div>
    </form>
  );
}
