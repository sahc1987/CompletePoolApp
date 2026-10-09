import { prisma } from "@/lib/prisma";
import { notifyAll } from "@/lib/notify";
import { hhmmToMin, isValidTimezone } from "@/lib/schedule";
import { assertRole, type Actor } from "@/server/actor";
import {
  conflict,
  invalid,
  notFound,
  ok,
  type ServiceResult,
} from "@/server/result";
import {
  deleteExtraSchema,
  deleteServiceSchema,
  saveExtraSchema,
  saveServiceSchema,
  saveTaxRateSchema,
  saveWorkHoursSchema,
  toggleTaxRateSchema,
  companyInfoSchema,
  type CompanyInfoInput,
  type DeleteExtraInput,
  type DeleteServiceInput,
  type SaveExtraInput,
  type SaveServiceInput,
  type SaveTaxRateInput,
  type SaveWorkHoursInput,
  type ToggleTaxRateInput,
} from "@/contracts/settings";

// --- Services ----------------------------------------------------------

export async function saveService(
  actor: Actor,
  input: SaveServiceInput
): Promise<ServiceResult<{ id: string }>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = saveServiceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { id, ...data } = parsed.data;

  if (id) {
    const updated = await prisma.service.update({ where: { id }, data });
    await notifyAll(`Service "${data.name}" was updated.`, {
      link: "/calendar",
      exceptUserId: actor.id,
    });
    return ok({ id: updated.id });
  }

  const created = await prisma.service.create({ data });
  await notifyAll(`New service added: "${data.name}".`, {
    link: "/calendar",
    exceptUserId: actor.id,
  });
  return ok({ id: created.id });
}

export async function deleteService(
  actor: Actor,
  input: DeleteServiceInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = deleteServiceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);

  const count = await prisma.task.count({
    where: { serviceId: parsed.data.id },
  });
  if (count > 0) {
    return conflict("This service is used by tasks and can't be deleted.");
  }
  await prisma.service.delete({ where: { id: parsed.data.id } });
  return ok();
}

// --- Business hours ----------------------------------------------------

export async function saveWorkHours(
  actor: Actor,
  input: SaveWorkHoursInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = saveWorkHoursSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);

  const startMin = hhmmToMin(parsed.data.workdayStart);
  const endMin = hhmmToMin(parsed.data.workdayEnd);
  if (startMin === null || endMin === null) {
    return invalid("Enter both times as HH:MM.");
  }
  if (endMin <= startMin) {
    return invalid("Closing time has to be after opening time.");
  }

  // Rejected here rather than stored: a bad zone would throw from every date
  // calculation in the app afterwards.
  const { timezone } = parsed.data;
  if (!isValidTimezone(timezone)) return invalid("Pick a valid timezone.");

  await prisma.appSettings.upsert({
    where: { id: "app" },
    update: { workdayStartMin: startMin, workdayEndMin: endMin, timezone },
    create: {
      id: "app",
      workdayStartMin: startMin,
      workdayEndMin: endMin,
      timezone,
    },
  });

  // Existing jobs are left alone — narrowing hours doesn't retroactively
  // invalidate work already on the calendar, it only constrains new edits.
  // A timezone change does re-interpret how stored instants are displayed,
  // which is the intent: the whole app moves to the new clock.
  return ok();
}

// --- Extra services ----------------------------------------------------

export async function saveExtra(
  actor: Actor,
  input: SaveExtraInput
): Promise<ServiceResult<{ id: string }>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = saveExtraSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { id, ...data } = parsed.data;

  const saved = id
    ? await prisma.extraService.update({ where: { id }, data })
    : await prisma.extraService.create({ data });
  return ok({ id: saved.id });
}

export async function deleteExtra(
  actor: Actor,
  input: DeleteExtraInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = deleteExtraSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);

  const count = await prisma.taskExtra.count({
    where: { extraServiceId: parsed.data.id },
  });
  if (count > 0) {
    return conflict("This extra is used by tasks and can't be deleted.");
  }
  await prisma.extraService.delete({ where: { id: parsed.data.id } });
  return ok();
}

// --- Tax rates ---------------------------------------------------------

export async function saveTaxRate(
  actor: Actor,
  input: SaveTaxRateInput
): Promise<ServiceResult<{ id: string }>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = saveTaxRateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { id, ...data } = parsed.data;

  const saved = id
    ? await prisma.taxRate.update({ where: { id }, data })
    : await prisma.taxRate.create({ data });
  return ok({ id: saved.id });
}

/**
 * Tax rates are snapshotted onto estimates when applied, so old estimates are
 * safe. We deactivate rather than delete to keep them out of new estimates
 * while preserving the catalog row.
 */
export async function toggleTaxRate(
  actor: Actor,
  input: ToggleTaxRateInput
): Promise<ServiceResult<{ active: boolean }>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = toggleTaxRateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);

  const rate = await prisma.taxRate.findUnique({
    where: { id: parsed.data.id },
  });
  if (!rate) return notFound("Tax rate not found.");

  const updated = await prisma.taxRate.update({
    where: { id: rate.id },
    data: { active: !rate.active },
  });
  return ok({ active: updated.active });
}

// --- Company identity --------------------------------------------------

/**
 * Save what invoices and receipts print about the business. Takes effect on
 * the next document; ones already sent are unchanged.
 */
export async function saveCompanyInfo(
  actor: Actor,
  input: CompanyInfoInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = companyInfoSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const c = parsed.data;

  const data = {
    companyName: c.name,
    companyTagline: c.tagline ?? null,
    companyAddress: c.address ?? null,
    companyPhone: c.phone ?? null,
    companyEmail: c.email ?? null,
    companyWebsite: c.website ?? null,
    companyTaxId: c.taxId ?? null,
    paymentTerms: c.paymentTerms ?? "Due upon receipt",
    paymentNote: c.paymentNote ?? null,
    documentFooter: c.documentFooter ?? null,
  };
  await prisma.appSettings.upsert({
    where: { id: "app" },
    update: data,
    create: { id: "app", ...data },
  });
  return ok();
}
