import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { open } from "@/server/crypto/secretBox";

/**
 * Outgoing email through Gmail (or a Google Workspace address) with an app
 * password, set up by an admin under Settings -> Email. The login lives in
 * AppSettings, the password encrypted (see secretBox).
 *
 * ponytail: Gmail only — the host is fixed. Another provider means a host
 * field in Settings and one line here.
 *
 * Nothing here logs an address, subject or credential.
 */

type MailConfig = { user: string; pass: string; fromName: string | null };

export async function getMailConfig(): Promise<MailConfig | null> {
  const s = await prisma.appSettings.findUnique({
    where: { id: "app" },
    select: { smtpUser: true, smtpPassEnc: true, smtpFrom: true },
  });
  if (!s?.smtpUser || !s.smtpPassEnc) return null;
  const pass = open(s.smtpPassEnc);
  return pass ? { user: s.smtpUser, pass, fromName: s.smtpFrom } : null;
}

export async function emailConfigured(): Promise<boolean> {
  return (await getMailConfig()) !== null;
}

function transportFor(user: string, pass: string) {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
    // A wrong host or a blocked port should fail in seconds, not hang a form.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

/** Log in to Gmail without sending anything. Throws if the address/password are refused or unreachable. */
export async function verifyLogin(user: string, pass: string): Promise<void> {
  await transportFor(user, pass).verify();
}

export type Mail = {
  to: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
};

export async function sendMail(mail: Mail): Promise<void> {
  const cfg = await getMailConfig();
  if (!cfg) throw new Error("Email is not set up.");
  // ponytail: a transport per send. One invoice at a time doesn't need a pooled
  // connection; add `pool: true` if bulk reminders ever do.
  await transportFor(cfg.user, cfg.pass).sendMail({
    from: cfg.fromName ? { name: cfg.fromName, address: cfg.user } : cfg.user,
    ...mail,
  });
}
