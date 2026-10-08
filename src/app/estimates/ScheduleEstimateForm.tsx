"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { scheduleEstimate } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { useActionToast } from "@/components/Toast";
import { inputClass, labelClass, selectClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

type Option = { id: string; name: string };
type Service = Option & { defaultDurationMin: number };

/**
 * Turns a signed estimate into a job on the calendar. The price starts at the
 * signed total — what the customer agreed to — and the job gets the same
 * business-hours and double-booking checks as one made on the assign page.
 */
export default function ScheduleEstimateForm({
  estimateId,
  total,
  defaultPoolId,
  pools,
  workers,
  services,
  workStart,
  workEnd,
}: {
  estimateId: string;
  total: number;
  defaultPoolId: string | null;
  pools: { id: string; address: string }[];
  workers: Option[];
  services: Service[];
  /** Business hours as "HH:MM", used to bound the time picker. */
  workStart: string;
  workEnd: string;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(scheduleEstimate, null);
  useActionToast(state, { success: "Job scheduled." });
  const [duration, setDuration] = useState(String(services[0]?.defaultDurationMin ?? 60));

  if (pools.length === 0) {
    return (
      <p className="text-sm text-muted">
        This client has no pool address yet. Add one on their client page, then
        schedule the job here.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="estimateId" value={estimateId} />

      <div>
        <label className={labelClass} htmlFor="se-pool">Pool</label>
        <select
          id="se-pool"
          name="poolId"
          required
          defaultValue={defaultPoolId ?? pools[0].id}
          className={selectClass}
        >
          {pools.map((p) => (
            <option key={p.id} value={p.id}>{p.address}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass} htmlFor="se-service">Service</label>
        <select
          id="se-service"
          name="serviceId"
          required
          className={selectClass}
          onChange={(e) => {
            const svc = services.find((s) => s.id === e.target.value);
            if (svc) setDuration(String(svc.defaultDurationMin));
          }}
        >
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass} htmlFor="se-worker">Worker</label>
        <select id="se-worker" name="workerId" required className={selectClass}>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="se-date">Date</label>
          <input id="se-date" name="date" type="date" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="se-time">Start</label>
          <input
            id="se-time"
            name="time"
            type="time"
            required
            min={workStart}
            max={workEnd}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="se-duration">Minutes</label>
          <input
            id="se-duration"
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
          <label className={labelClass} htmlFor="se-price">Price ($)</label>
          <input
            id="se-price"
            name="price"
            type="number"
            step="0.01"
            min={0}
            required
            defaultValue={total.toFixed(2)}
            className={inputClass}
          />
        </div>
      </div>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <SubmitButton pendingLabel="Scheduling…">Schedule job</SubmitButton>
    </form>
  );
}
