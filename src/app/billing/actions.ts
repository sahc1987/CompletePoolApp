"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { opt, str } from "@/lib/formData";
import * as billingService from "@/server/services/billing";
import type { ActionState } from "@/lib/actions";

// Record a payment against a bill. Admin-only — owner is read-only.
export async function payBill(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const res = await billingService.payBill(actor, {
    billId: str(formData, "billId"),
    amount: str(formData, "amount"),
    method: str(formData, "method"),
    checkNumber: opt(formData, "checkNumber"),
    billingAddress: opt(formData, "billingAddress"),
    note: opt(formData, "note"),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/billing");
  revalidatePath("/calendar");
  return { ok: true };
}

// Undo every payment on a bill (correction, e.g. a bounced check) — admin-only.
// Requires a reason, which is logged as a PaymentReversal.
export async function markBillUnpaid(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("ADMIN");
  const res = await billingService.reverseBillPayments(actor, {
    billId: str(formData, "billId"),
    reason: str(formData, "reason"),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/billing");
  revalidatePath("/calendar");
  return { ok: true };
}
