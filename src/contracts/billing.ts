import { z } from "zod";
import { choice, optionalText, positiveNumber } from "./primitives";
import { paymentMethodSchema } from "./enums";

/**
 * The money-in fields, shared by the billing page and the calendar's
 * charge-on-the-spot flow. `lib/billing.ts` validates the method-specific
 * requirements (a check number, a card billing address) centrally, so they stay
 * optional here.
 */
export const paymentDetailsSchema = z.object({
  amount: positiveNumber("Enter an amount greater than $0"),
  method: choice(paymentMethodSchema, "Pick a payment method"),
  checkNumber: optionalText,
  billingAddress: optionalText,
  note: optionalText,
});
export type PaymentDetailsInput = z.input<typeof paymentDetailsSchema>;

export const payBillSchema = paymentDetailsSchema.extend({
  billId: z.string().min(1, "Missing bill"),
});
export type PayBillInput = z.input<typeof payBillSchema>;

export const chargeTaskSchema = paymentDetailsSchema.extend({
  taskId: z.string().min(1, "Missing task"),
});
export type ChargeTaskInput = z.input<typeof chargeTaskSchema>;

export const reverseBillSchema = z.object({
  billId: z.string().min(1, "Missing bill"),
  reason: z
    .string()
    .trim()
    .min(1, "Enter a reason for undoing the payments"),
});
export type ReverseBillInput = z.input<typeof reverseBillSchema>;
