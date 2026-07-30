"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { recordPayment, resetBillPayments } from "@/lib/billing";
import type { ActionState } from "@/lib/actions";

const paySchema = z.object({
  billId: z.string().min(1),
  amount: z.coerce.number().positive("Enter an amount greater than $0"),
  method: z.enum(["CASH", "CHECK", "ONLINE"]),
  checkNumber: z.string().trim().optional(),
  billingAddress: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

// Record a payment against a bill. Admin-only — owner is read-only.
export async function payBill(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole("ADMIN");
  const parsed = paySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const res = await recordPayment({ ...parsed.data, userId: user.id });
  if (res.error) return { error: res.error };

  revalidatePath("/billing");
  revalidatePath("/calendar");
  return { ok: true };
}

const undoSchema = z.object({
  billId: z.string().min(1),
  reason: z.string().trim().min(1, "Enter a reason for undoing the payments"),
});

// Undo every payment on a bill (correction, e.g. a bounced check) — admin-only.
// Requires a reason, which is logged as a PaymentReversal.
export async function markBillUnpaid(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole("ADMIN");
  const parsed = undoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const res = await resetBillPayments(parsed.data.billId, parsed.data.reason, user.id);
  if (res.error) return { error: res.error };

  revalidatePath("/billing");
  revalidatePath("/calendar");
  return { ok: true };
}
