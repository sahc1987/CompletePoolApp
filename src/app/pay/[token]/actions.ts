"use server";

import { redirect } from "next/navigation";
import { str } from "@/lib/formData";
import * as onlinePayments from "@/server/services/onlinePayments";
import type { ActionState } from "@/lib/actions";

// Public: the customer has no account. The pay token in the form is the only
// credential, and the service resolves everything else from it.
export async function payInvoice(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const res = await onlinePayments.startCheckout(str(formData, "token"));
  if (!res.ok) return { error: res.error };
  redirect(res.data.url);
}
