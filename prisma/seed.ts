import { PrismaClient, Role, TaskStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// DEV ONLY. Every seeded account uses this password so you can log in and
// test each role immediately. Change it (and don't reuse it) before this
// touches anything real.
const DEV_PASSWORD = "password123";

async function main() {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  // --- Users -----------------------------------------------------------
  const owner = await prisma.user.upsert({
    where: { email: "owner@completepoolservice.com" },
    update: {},
    create: {
      name: "Owner",
      email: "owner@completepoolservice.com",
      passwordHash,
      role: Role.OWNER,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@completepoolservice.com" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@completepoolservice.com",
      passwordHash,
      role: Role.ADMIN,
    },
  });

  // Fixed ids ("w1", "w2") so they line up with the tasks seeded below and
  // with any lingering references in the calendar's old sample data.
  const jake = await prisma.user.upsert({
    where: { email: "jake@completepoolservice.com" },
    update: {},
    create: {
      id: "w1",
      name: "Jake",
      email: "jake@completepoolservice.com",
      passwordHash,
      role: Role.WORKER,
    },
  });

  const marco = await prisma.user.upsert({
    where: { email: "marco@completepoolservice.com" },
    update: {},
    create: {
      id: "w2",
      name: "Marco",
      email: "marco@completepoolservice.com",
      passwordHash,
      role: Role.WORKER,
    },
  });

  // --- Services --------------------------------------------------------
  const services = [
    { id: "svc-daily", name: "Daily Clean", basePrice: 45, defaultDurationMin: 30 },
    { id: "svc-maint", name: "Maintenance", basePrice: 120, defaultDurationMin: 60 },
    { id: "svc-repair", name: "Repair", basePrice: 150, defaultDurationMin: 90 },
    { id: "svc-filter", name: "Filter Replacement", basePrice: 95, defaultDurationMin: 60 },
  ];
  for (const s of services) {
    await prisma.service.upsert({ where: { id: s.id }, update: {}, create: s });
  }

  // --- Extra services --------------------------------------------------
  const extras = [
    { id: "ext-acid", name: "Acid wash", price: 60 },
    { id: "ext-vac", name: "Deep vacuum", price: 25 },
    { id: "ext-shock", name: "Shock treatment", price: 30 },
  ];
  for (const e of extras) {
    await prisma.extraService.upsert({ where: { id: e.id }, update: {}, create: e });
  }

  // --- Materials -------------------------------------------------------
  const materials = [
    { id: "mat-chlorine", name: "Chlorine", unit: "gallon", costPrice: 3, customerPrice: 6, quantityOnHand: 40, reorderThreshold: 10 },
    { id: "mat-filter", name: "Filter Cartridge", unit: "unit", costPrice: 15, customerPrice: 30, quantityOnHand: 8, reorderThreshold: 5 },
    { id: "mat-acid", name: "Muriatic Acid", unit: "gallon", costPrice: 5, customerPrice: 10, quantityOnHand: 20, reorderThreshold: 6 },
  ];
  for (const m of materials) {
    await prisma.material.upsert({ where: { id: m.id }, update: {}, create: m });
  }

  // --- Tax rates -------------------------------------------------------
  const taxRates = [
    { id: "tax-state", name: "State Sales Tax", rate: 8.875, active: true },
    { id: "tax-county", name: "County Tax", rate: 1.0, active: true },
  ];
  for (const t of taxRates) {
    await prisma.taxRate.upsert({ where: { id: t.id }, update: {}, create: t });
  }

  // --- Clients + pools -------------------------------------------------
  const clients = [
    { id: "cli-roberto", name: "Roberto Martinez", phone: "516-555-0142", email: "roberto@example.com", pool: { id: "pool-roberto", address: "142 Ocean Ave, Long Beach, NY", size: "20,000 gal", type: "In-ground" } },
    { id: "cli-susan", name: "Susan Ferraro", phone: "516-555-0088", email: "susan@example.com", pool: { id: "pool-susan", address: "88 Merrick Rd, Rockville Centre, NY", size: "15,000 gal", type: "In-ground" } },
    { id: "cli-david", name: "David Okafor", phone: "516-555-0021", email: "david@example.com", pool: { id: "pool-david", address: "21 Sunrise Hwy, Baldwin, NY", size: "30,000 gal", type: "In-ground" } },
    { id: "cli-priya", name: "Priya Nair", phone: "516-555-0009", email: "priya@example.com", pool: { id: "pool-priya", address: "9 Lakeview Dr, Freeport, NY", size: "12,000 gal", type: "Above-ground" } },
  ];
  for (const c of clients) {
    await prisma.client.upsert({
      where: { id: c.id },
      update: {},
      create: { id: c.id, name: c.name, phone: c.phone, email: c.email },
    });
    await prisma.pool.upsert({
      where: { id: c.pool.id },
      update: {},
      create: { id: c.pool.id, clientId: c.id, address: c.pool.address, size: c.pool.size, type: c.pool.type },
    });
  }

  // --- Tasks -----------------------------------------------------------
  // Dates chosen to line up with the calendar's initialDate (2026-07-13).
  const tasks = [
    { id: "t1", clientId: "cli-roberto", poolId: "pool-roberto", workerId: "w1", serviceId: "svc-daily", day: "2026-07-13", time: "09:00", durationMin: 30, price: 45, status: TaskStatus.SCHEDULED },
    { id: "t2", clientId: "cli-susan", poolId: "pool-susan", workerId: "w1", serviceId: "svc-daily", day: "2026-07-13", time: "10:00", durationMin: 30, price: 45, status: TaskStatus.SCHEDULED },
    { id: "t3", clientId: "cli-david", poolId: "pool-david", workerId: "w2", serviceId: "svc-maint", day: "2026-07-13", time: "11:00", durationMin: 60, price: 120, status: TaskStatus.IN_PROGRESS },
    { id: "t4", clientId: "cli-roberto", poolId: "pool-roberto", workerId: "w1", serviceId: "svc-daily", day: "2026-07-14", time: "09:00", durationMin: 30, price: 45, status: TaskStatus.SCHEDULED },
    { id: "t5", clientId: "cli-priya", poolId: "pool-priya", workerId: "w2", serviceId: "svc-filter", day: "2026-07-14", time: "13:00", durationMin: 60, price: 95, status: TaskStatus.SUBMITTED },
    { id: "t6", clientId: "cli-susan", poolId: "pool-susan", workerId: "w1", serviceId: "svc-daily", day: "2026-07-15", time: "09:00", durationMin: 30, price: 45, status: TaskStatus.SCHEDULED },
  ];
  for (const t of tasks) {
    const startTime = new Date(`${t.day}T${t.time}:00`);
    await prisma.task.upsert({
      where: { id: t.id },
      update: {},
      create: {
        id: t.id,
        clientId: t.clientId,
        poolId: t.poolId,
        workerId: t.workerId,
        serviceId: t.serviceId,
        date: new Date(`${t.day}T00:00:00`),
        startTime,
        durationMin: t.durationMin,
        price: t.price,
        status: t.status,
        submittedAt: t.status === TaskStatus.SUBMITTED ? startTime : null,
      },
    });
  }

  console.log("Seeded:");
  console.log(`  Owner:  ${owner.email} / ${DEV_PASSWORD}`);
  console.log(`  Admin:  ${admin.email} / ${DEV_PASSWORD}`);
  console.log(`  Worker: ${jake.email} / ${DEV_PASSWORD}`);
  console.log(`  Worker: ${marco.email} / ${DEV_PASSWORD}`);
  console.log(`  + ${clients.length} clients/pools, ${services.length} services, ${materials.length} materials, ${tasks.length} tasks`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
