import { prisma } from "@/lib/prisma";
import { assertRole, type Actor } from "@/server/actor";
import {
  conflict,
  invalid,
  ok,
  type ServiceResult,
} from "@/server/result";
import {
  createPoolSchema,
  clientFieldsSchema,
  deleteClientSchema,
  deletePoolSchema,
  updateClientSchema,
  updatePoolSchema,
  type ClientFieldsInput,
  type CreatePoolInput,
  type DeleteClientInput,
  type DeletePoolInput,
  type UpdateClientInput,
  type UpdatePoolInput,
} from "@/contracts/clients";

export async function createClient(
  actor: Actor,
  input: ClientFieldsInput
): Promise<ServiceResult<{ id: string }>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = clientFieldsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { name, phone, email, address, notes } = parsed.data;

  const client = await prisma.client.create({
    data: {
      name,
      phone: phone ?? null,
      email: email ?? null,
      address: address ?? null,
      notes: notes ?? null,
    },
  });
  return ok({ id: client.id });
}

export async function updateClient(
  actor: Actor,
  input: UpdateClientInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = updateClientSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { id, name, phone, email, address, notes } = parsed.data;

  await prisma.client.update({
    where: { id },
    data: {
      name,
      phone: phone ?? null,
      email: email ?? null,
      address: address ?? null,
      notes: notes ?? null,
    },
  });
  return ok();
}

/**
 * Don't orphan history: block deletion if the client has any tasks or
 * estimates. Pools with no tasks are removed alongside the client.
 */
export async function deleteClient(
  actor: Actor,
  input: DeleteClientInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = deleteClientSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { id } = parsed.data;

  const [taskCount, estimateCount] = await Promise.all([
    prisma.task.count({ where: { clientId: id } }),
    prisma.estimate.count({ where: { clientId: id } }),
  ]);
  if (taskCount > 0 || estimateCount > 0) {
    return conflict(
      "This client has tasks or estimates on record and can't be deleted."
    );
  }

  await prisma.pool.deleteMany({ where: { clientId: id } });
  await prisma.client.delete({ where: { id } });
  return ok();
}

export async function createPool(
  actor: Actor,
  input: CreatePoolInput
): Promise<ServiceResult<{ id: string }>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = createPoolSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { clientId, address, size, type } = parsed.data;

  const pool = await prisma.pool.create({
    data: { clientId, address, size: size ?? null, type: type ?? null },
  });
  return ok({ id: pool.id });
}

export async function updatePool(
  actor: Actor,
  input: UpdatePoolInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = updatePoolSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);
  const { id, address, size, type } = parsed.data;

  await prisma.pool.update({
    where: { id },
    data: { address, size: size ?? null, type: type ?? null },
  });
  return ok();
}

export async function deletePool(
  actor: Actor,
  input: DeletePoolInput
): Promise<ServiceResult<void>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const parsed = deletePoolSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.errors[0].message);

  const taskCount = await prisma.task.count({
    where: { poolId: parsed.data.id },
  });
  if (taskCount > 0) {
    return conflict("This pool has tasks on record and can't be deleted.");
  }
  await prisma.pool.delete({ where: { id: parsed.data.id } });
  return ok();
}
