/**
 * A hand-rolled stand-in for the Prisma client.
 *
 * These suites test business rules, not SQL, so the real client is replaced
 * wholesale: no database has to exist for `npm test` to run. Each test seeds
 * only the calls it cares about, e.g.
 *
 *   prismaMock.task.findMany.mockResolvedValue([...]);
 *
 * `$transaction` resolves the array of operations it is handed, which is how
 * the app uses it.
 */
export type PrismaMock = ReturnType<typeof createPrismaMock>;

const MODELS = [
  "task",
  "taskMaterial",
  "bill",
  "payment",
  "paymentReversal",
  "material",
  "stockMovement",
  "materialRequest",
  "appSettings",
  "user",
  "client",
  "loginAttempt",
  "loginSource",
  "notification",
] as const;

const METHODS = [
  "findUnique",
  "findFirst",
  "findMany",
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
] as const;

export function createPrismaMock() {
  const client: Record<string, unknown> = {
    $transaction: jest.fn(async (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops) : (ops as (c: unknown) => unknown)(client)
    ),
  };
  for (const model of MODELS) {
    const m: Record<string, jest.Mock> = {};
    for (const method of METHODS) {
      // Default to "nothing there" so an unseeded call fails loudly in the
      // assertion rather than hanging on an undefined promise.
      m[method] = jest.fn().mockResolvedValue(null);
    }
    m.findMany.mockResolvedValue([]);
    client[model] = m;
  }
  return client as {
    $transaction: jest.Mock;
  } & Record<
    (typeof MODELS)[number],
    Record<(typeof METHODS)[number], jest.Mock>
  >;
}
