import { prisma } from "@/lib/prisma";
import {
  createBillForTask,
  recordPayment,
  resetBillPayments,
} from "@/lib/billing";
import { assertRole, type Actor } from "@/server/actor";
import {
  badState,
  invalid,
  notFound,
  ok,
  type ServiceResult,
} from "@/server/result";
import {
  chargeTaskSchema,
  payBillSchema,
  reverseBillSchema,
  type ChargeTaskInput,
  type PayBillInput,
  type ReverseBillInput,
} from "@/contracts/billing";

/**
 * Money moves are admin-only. Owner outranks admin everywhere else but is
 * deliberately read-only over billing — see the route rules in middleware.ts.
 */

/**
 * `lib/billing` reports every failure as a message with no category. Most are
 * rejected input ("payment can't exceed the balance"), so VALIDATION is the
 * right default; the two that mean "no such row" are recognised here so the
 * API can answer 404 instead of 400.
 */
function classify(message: string) {
  return message === "Bill not found"
    ? notFound("Bill not found")
    : invalid(message);
}

export async function payBill(
  actor: Actor,
  input: PayBillInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = payBillSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);

  const res = await recordPayment({ ...parsed.data, userId: actor.id });
  if (res.error) return classify(res.error);
  return ok();
}

export async function reverseBillPayments(
  actor: Actor,
  input: ReverseBillInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = reverseBillSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);

  const res = await resetBillPayments(
    parsed.data.billId,
    parsed.data.reason,
    actor.id
  );
  if (res.error) return classify(res.error);
  return ok();
}

/**
 * Take payment for a finished job without going via the billing page. The bill
 * is created on demand, because a job finished from the calendar may not have
 * been billed yet.
 */
export async function chargeTask(
  actor: Actor,
  input: ChargeTaskInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = chargeTaskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { taskId, ...payment } = parsed.data;

  // A bill is raised for finished work only. Without this, charging a job
  // still on the schedule (or one that was cancelled) would invent a bill for
  // work that never happened.
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { status: true },
  });
  if (!task) return notFound("Task not found.");
  if (task.status !== "APPROVED") {
    return badState("Finish the job before charging for it.");
  }

  const bill =
    (await prisma.bill.findUnique({ where: { taskId } })) ??
    (await createBillForTask(taskId));
  if (!bill) return badState("No bill for this job yet.");

  const res = await recordPayment({
    billId: bill.id,
    ...payment,
    userId: actor.id,
  });
  if (res.error) return classify(res.error);
  return ok();
}
