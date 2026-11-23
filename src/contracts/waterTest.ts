import { z } from "zod";

/**
 * Water-test readings: what a worker records at a visit, and how a reading is
 * judged. Shared with the mobile app (`@contracts/waterTest`), so the phone
 * flags a value exactly as the server and web do — no second copy of the ranges.
 *
 * The ranges are the commonly used targets for a residential pool. They are a
 * prompt for the worker, not a diagnosis: nothing is blocked for being out of
 * range, and no dose is suggested. Change them here to change them everywhere.
 */

export const READINGS = {
  freeChlorine: { label: "Free chlorine", unit: "ppm", min: 1, max: 3, limit: 20, step: 0.1 },
  ph: { label: "pH", unit: "", min: 7.2, max: 7.8, limit: 14, step: 0.1 },
  alkalinity: { label: "Total alkalinity", unit: "ppm", min: 80, max: 120, limit: 500, step: 1 },
  cyanuricAcid: { label: "Stabilizer (CYA)", unit: "ppm", min: 30, max: 50, limit: 300, step: 1 },
} as const;

export type ReadingKey = keyof typeof READINGS;
export const READING_KEYS = Object.keys(READINGS) as ReadingKey[];
export type ReadingStatus = "low" | "ok" | "high";

export function readingStatus(key: ReadingKey, value: number): ReadingStatus {
  const { min, max } = READINGS[key];
  if (value < min) return "low";
  if (value > max) return "high";
  return "ok";
}

/** "1–3 ppm" / "7.2–7.8" — the target, for showing next to a flagged value. */
export function readingTarget(key: ReadingKey): string {
  const { min, max, unit } = READINGS[key];
  return `${min}–${max}${unit ? ` ${unit}` : ""}`;
}

const reading = (key: ReadingKey, whole: boolean) => {
  const { label, limit } = READINGS[key];
  const n = whole ? z.number().int(`${label} must be a whole number`) : z.number();
  return n
    .min(0, `${label} can't be negative`)
    .max(limit, `${label} looks too high to be right`)
    .nullish();
};

/** Every reading optional (skip what you didn't test), but at least one is required. */
export const waterTestFieldsSchema = z
  .object({
    freeChlorine: reading("freeChlorine", false),
    ph: reading("ph", false),
    alkalinity: reading("alkalinity", true),
    cyanuricAcid: reading("cyanuricAcid", true),
  })
  .refine((v) => READING_KEYS.some((k) => v[k] != null), {
    message: "Enter at least one reading.",
  });

export const saveWaterTestSchema = z.intersection(
  z.object({ taskId: z.string().min(1, "Task is required") }),
  waterTestFieldsSchema
);
export type WaterTestFields = z.input<typeof waterTestFieldsSchema>;
export type SaveWaterTestInput = z.input<typeof saveWaterTestSchema>;

/** A reading as the API returns it. Missing readings are null. */
export type WaterTestReading = {
  id: string;
  taskId: string;
  poolId: string;
  takenAt: string;
  freeChlorine: number | null;
  ph: number | null;
  alkalinity: number | null;
  cyanuricAcid: number | null;
};
