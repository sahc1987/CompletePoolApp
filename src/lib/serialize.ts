import { Prisma } from "@prisma/client";

// Prisma returns Decimal columns as Decimal objects, which can't cross the
// server -> client component boundary and aren't convenient to render. Convert
// them to plain numbers before handing data to client components.
export function toNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : value.toNumber();
}

// Format a number (or Decimal) as USD for display.
export function money(value: Prisma.Decimal | number | null | undefined): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}
