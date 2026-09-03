import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  buildNotificationPayload,
  notificationSignature,
  type NotificationViewer,
} from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel's ceiling for a streaming function on the lower plans. The stream
// closes itself well before this (see WINDOW_MS) so the platform never kills
// it mid-flight.
export const maxDuration = 60;

// How often we ask the database whether anything changed. Two indexed
// aggregates per tick — see notificationSignature.
const TICK_MS = 3000;
// How long one connection lives before it hands over to the client's automatic
// reconnect. Bounding it keeps a serverless invocation from running forever and
// gives every connection a periodic full refresh.
const WINDOW_MS = 50_000;
// Comment frames keep proxies from closing an idle connection.
const HEARTBEAT_MS = 15_000;
// Reconnect delay the browser should use after we close.
const RETRY_MS = 2000;

/**
 * Live notification feed over Server-Sent Events.
 *
 * The bell used to poll every 20 seconds, so a job reassigned to a worker could
 * sit unseen for most of a minute. This pushes instead: the connection is held
 * open and an `update` event carrying the same payload as GET /api/notifications
 * is written the moment the user's notifications or assigned work change.
 *
 * There is no pub/sub in front of Postgres here, so "the moment" means a cheap
 * change-detection query every TICK_MS. That is still ~7x faster than the old
 * poll and keeps the full payload query off the every-tick path.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response("unauthorized", { status: 401 });
  }

  const viewer: NotificationViewer = {
    id: session.user.id,
    role: session.user.role,
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true; // Client vanished between checks.
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already torn down */
        }
      };

      // How long the browser waits before reconnecting once we end the stream.
      send(`retry: ${RETRY_MS}\n\n`);

      req.signal.addEventListener("abort", close);

      const startedAt = Date.now();
      let lastSignature = "";
      let lastBeat = Date.now();

      while (!closed && Date.now() - startedAt < WINDOW_MS) {
        try {
          const signature = await notificationSignature(viewer);
          if (signature !== lastSignature) {
            lastSignature = signature;
            const payload = await buildNotificationPayload(viewer);
            send(`event: update\ndata: ${JSON.stringify(payload)}\n\n`);
            lastBeat = Date.now();
          } else if (Date.now() - lastBeat >= HEARTBEAT_MS) {
            send(": ping\n\n");
            lastBeat = Date.now();
          }
        } catch {
          // A transient database error shouldn't kill the feed — the next tick
          // retries, and a persistent failure ends with the window anyway.
        }

        if (closed) break;
        await new Promise((r) => setTimeout(r, TICK_MS));
      }

      req.signal.removeEventListener("abort", close);
      close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disables proxy buffering, which would otherwise hold frames back.
      "X-Accel-Buffering": "no",
    },
  });
}
