"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { editTask, finishTask, chargeTask } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import StatusBadge from "@/components/StatusBadge";
import PaymentFields from "@/components/PaymentFields";
import AddressMap from "@/components/AddressMap";
import { Modal } from "@/components/Modal";
import { useActionToast } from "@/components/Toast";
import { inputClass, selectClass, labelClass, btnGhost } from "@/components/styles";
import type { ActionState } from "@/lib/actions";
import type { CalendarTask } from "./CalendarView";

type Worker = { id: string; name: string };
type Service = { id: string; name: string; basePrice: number; defaultDurationMin: number };
type Material = { id: string; name: string; unit: string };

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  CHECK: "Check",
  ONLINE: "Online",
};

function usd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

// Prefill values must be the business-local wall clock: the server parses them
// back in that same zone, so reading them in the viewer's zone would shift the
// job every time the form was saved.
function localParts(iso: string, timeZone: string) {
  const d = new Date(iso);
  // en-CA gives YYYY-MM-DD; en-GB with hour12:false gives HH:MM.
  return {
    date: d.toLocaleDateString("en-CA", { timeZone }),
    time: d.toLocaleTimeString("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  };
}

export default function EditTaskModal({
  task,
  workers,
  services,
  materials,
  workStart,
  workEnd,
  timezone,
  onClose,
}: {
  task: CalendarTask;
  workers: Worker[];
  services: Service[];
  /** Catalog offered when finishing the job. */
  materials: Material[];
  /** Business hours as "HH:MM", used to bound the time picker. */
  workStart: string;
  workEnd: string;
  /** Business timezone the date/time fields are expressed in. */
  timezone: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction] = useFormState<ActionState, FormData>(editTask, null);
  const [finishState, finishAction] = useFormState<ActionState, FormData>(finishTask, null);
  const [chargeState, chargeAction] = useFormState<ActionState, FormData>(chargeTask, null);
  const { date, time } = localParts(task.start, timezone);
  const [duration, setDuration] = useState(String(task.durationMin));
  const [price, setPrice] = useState(String(task.price ?? 0));

  useActionToast(state, { success: "Job updated." });
  useActionToast(finishState, { success: "Job finished and billed." });
  useActionToast(chargeState, { success: "Payment recorded." });

  const finished = task.status === "APPROVED";
  const bill = task.bill;
  // The crew already logged material on submit, so the admin isn't asked
  // again — entering it twice would drain stock and double-bill.
  const alreadyLogged = task.materialsUsed.length > 0;

  // Close + refresh once the save succeeds.
  useEffect(() => {
    if (state?.ok) {
      onClose();
      router.refresh();
    }
  }, [state, onClose, router]);

  // Finishing / charging keeps the modal open so the panel updates in place.
  useEffect(() => {
    if (finishState?.ok || chargeState?.ok) router.refresh();
  }, [finishState, chargeState, router]);

  function onServiceChange(serviceId: string) {
    const svc = services.find((s) => s.id === serviceId);
    if (svc) {
      setDuration(String(svc.defaultDurationMin));
      setPrice(String(svc.basePrice));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit job"
      // The address is shown (and mapped) below, so it isn't repeated here.
      subtitle={task.clientName}
    >
      <>
        {/* Finish the job and take payment without leaving the calendar. */}
        <div className="mb-5 rounded-2xl border border-line/70 bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[15px] font-bold text-navy-900">
              Job status
            </span>
            <StatusBadge status={task.status} />
          </div>

          {!finished && (
            <form action={finishAction} className="space-y-4">
              <input type="hidden" name="taskId" value={task.id} />

              {/* Material has to be captured before the bill exists — it is
                  part of what the customer owes, and it comes off the shelf. */}
              {alreadyLogged ? (
                <div>
                  <p className={labelClass}>Materials used</p>
                  <ul className="space-y-1 text-sm text-ink">
                    {task.materialsUsed.map((m) => (
                      <li key={m.name} className="flex justify-between gap-3">
                        <span>{m.name}</span>
                        <span className="tabular-nums text-muted">
                          {m.quantityUsed} {m.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs text-faint">
                    Logged by the crew and already taken out of stock.
                  </p>
                </div>
              ) : (
                <div>
                  <p className={labelClass}>Materials used (optional)</p>
                  {materials.length === 0 ? (
                    <p className="text-xs text-faint">No materials in the catalog.</p>
                  ) : (
                    <>
                      <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                        {materials.map((m) => (
                          <label
                            key={m.id}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span>
                              {m.name} <span className="text-faint">({m.unit})</span>
                            </span>
                            <input
                              name={`qty_${m.id}`}
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0"
                              className={`${inputClass} w-24`}
                            />
                          </label>
                        ))}
                      </div>
                      <p className="mt-1.5 text-xs text-faint">
                        Comes off stock and is added to the customer&apos;s bill.
                      </p>
                    </>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">
                  Mark this job complete and create the customer&apos;s bill.
                </p>
                <SubmitButton pendingLabel="Finishing…">Finish job</SubmitButton>
              </div>
              {finishState?.error && (
                <p className="text-sm text-danger">{finishState.error}</p>
              )}
            </form>
          )}

          {finished && bill && bill.status !== "PAID" && (
            <form action={chargeAction} className="space-y-4">
              <input type="hidden" name="taskId" value={task.id} />
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-sm text-muted">
                    {bill.status === "PARTIAL" ? "Balance due" : "Amount due"}
                  </div>
                  <div className="text-2xl font-bold text-ink">{usd(bill.balance)}</div>
                </div>
                {bill.status === "PARTIAL" && (
                  <span className="text-sm text-muted">
                    {usd(bill.paid)} of {usd(bill.amount)} collected
                  </span>
                )}
              </div>

              <PaymentFields balance={bill.balance} />

              {chargeState?.error && (
                <p className="text-sm text-danger">{chargeState.error}</p>
              )}
              <div className="flex justify-end">
                <SubmitButton pendingLabel="Charging…">Charge customer</SubmitButton>
              </div>
            </form>
          )}

          {finished && bill && bill.status === "PAID" && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm text-muted">Paid</div>
                <div className="text-2xl font-bold text-good">{usd(bill.amount)}</div>
              </div>
              <span className="rounded-full bg-good/10 px-3 py-1 text-sm font-semibold text-good">
                {bill.method ? METHOD_LABEL[bill.method] : "Paid"}
                {bill.paidAt
                  ? ` · ${new Date(bill.paidAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}`
                  : ""}
              </span>
            </div>
          )}

          {finished && !bill && (
            <p className="text-sm text-muted">Finished — no bill on record.</p>
          )}
        </div>

        {/* Where the job actually is — the subtitle only gives the text. */}
        <div className="mb-5">
          <AddressMap address={task.address} />
        </div>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="taskId" value={task.id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="edit-service">Service</label>
              <select
                id="edit-service"
                name="serviceId"
                required
                defaultValue={task.serviceId}
                className={selectClass}
                onChange={(e) => onServiceChange(e.target.value)}
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="edit-worker">Worker</label>
              <select
                id="edit-worker"
                name="workerId"
                required
                defaultValue={task.workerId}
                className={selectClass}
              >
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="edit-date">Date</label>
              <input id="edit-date" name="date" type="date" required defaultValue={date} className={inputClass} />
            </div>

            <div>
              <label className={labelClass} htmlFor="edit-time">Start time</label>
              <input
                id="edit-time"
                name="time"
                type="time"
                required
                min={workStart}
                max={workEnd}
                defaultValue={time}
                className={inputClass}
              />
              <p className="mt-1 text-[11px] text-faint">
                Open {workStart}–{workEnd}
              </p>
            </div>

            <div>
              <label className={labelClass} htmlFor="edit-duration">Duration (min)</label>
              <input
                id="edit-duration"
                name="durationMin"
                type="number"
                min={5}
                required
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="edit-price">Price ($)</label>
              <input
                id="edit-price"
                name="price"
                type="number"
                step="0.01"
                min={0}
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {state?.error && <p className="text-sm text-danger">{state.error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={btnGhost}>
              Cancel
            </button>
            <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
          </div>
        </form>
      </>
    </Modal>
  );
}
