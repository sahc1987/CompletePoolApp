import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isDemoUser } from "@/lib/demo";

/**
 * A strip across the top of every page while the demo account is signed in,
 * so nobody mistakes the read-only tour for the working app — or wonders why
 * Save does nothing.
 */
export default async function DemoBanner() {
  const session = await getServerSession(authOptions);
  if (!isDemoUser(session?.user)) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 bg-gold-400 px-4 py-2 text-center text-sm font-semibold text-navy-900"
    >
      Demo mode: you&apos;re looking around a read-only account. Changes are turned off.
    </div>
  );
}
