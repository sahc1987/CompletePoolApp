import type {
  EstimateStatus,
  Frequency,
  MaterialRequestStatus,
  PaymentMethod,
  PaymentStatus,
  PhotoType,
  Role,
  StockMovementType,
  TaskStatus,
} from "@prisma/client";
import type {
  EstimateStatusValue,
  FrequencyValue,
  MaterialRequestStatusValue,
  PaymentMethodValue,
  PaymentStatusValue,
  PhotoTypeValue,
  RoleValue,
  StockMovementTypeValue,
  TaskStatusValue,
} from "@/contracts/enums";

/**
 * Compile-time guard that the Zod enums in `contracts/enums.ts` still match the
 * Prisma schema exactly.
 *
 * The contracts can't import `@prisma/client` — they ship to the mobile app —
 * so the duplication is deliberate. This file is where it gets checked: adding
 * a `TaskStatus` value to the schema without adding it to the contract fails
 * the type check here, rather than silently rejecting the new value at an API
 * boundary months later.
 *
 * Nothing imports this; `tsc` checks it because it is part of the project.
 */

/** `true` only when each union covers exactly the other. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

// Each line fails to compile if either side gains or loses a member.
const _role: Same<Role, RoleValue> = true;
const _taskStatus: Same<TaskStatus, TaskStatusValue> = true;
const _frequency: Same<Frequency, FrequencyValue> = true;
const _photoType: Same<PhotoType, PhotoTypeValue> = true;
const _stockMovementType: Same<StockMovementType, StockMovementTypeValue> = true;
const _materialRequestStatus: Same<
  MaterialRequestStatus,
  MaterialRequestStatusValue
> = true;
const _paymentStatus: Same<PaymentStatus, PaymentStatusValue> = true;
const _paymentMethod: Same<PaymentMethod, PaymentMethodValue> = true;
const _estimateStatus: Same<EstimateStatus, EstimateStatusValue> = true;

// Referenced so `noUnusedLocals` can't strip the checks above.
export const ENUM_PARITY_CHECKED = [
  _role,
  _taskStatus,
  _frequency,
  _photoType,
  _stockMovementType,
  _materialRequestStatus,
  _paymentStatus,
  _paymentMethod,
  _estimateStatus,
].every(Boolean);
