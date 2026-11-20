import { getCompanyInfo } from "@/lib/company";
import { assertRole, type Actor } from "@/server/actor";
import { emailConfigured, sendMail } from "@/server/email/mailer";
import { appBaseUrl } from "@/server/payments/stripe";
import { badState, invalid, notFound, ok, type ServiceResult } from "@/server/result";
import { renderInvoicePdf } from "./billDocuments";
import { getBill } from "./billingReads";

/**
 * Email a bill's invoice (PDF attached, pay link in the body) to the client.
 *
 * Admin only — it sends mail in the company's name. The owner is read-only, as
 * everywhere else in billing, and the public demo can't reach it.
 */
export async function emailInvoice(
  actor: Actor,
  billId: string
): Promise<ServiceResult<{ sentTo: string }>> {
  const denied = assertRole(actor, "ADMIN");
  if (denied) return denied;

  const found = await getBill(actor, billId);
  if (!found.ok) return found;
  if (!found.data) return notFound("Bill not found.");
  const bill = found.data;

  const to = bill.task.client.email?.trim();
  if (!to) {
    return invalid(
      `${bill.task.client.name} has no email address. Add one on the Clients page, then try again.`
    );
  }
  if (!(await emailConfigured())) {
    return badState("Email isn't set up yet. Connect an email account under Settings, then try again.");
  }

  const pdf = await renderInvoicePdf(actor, billId, appBaseUrl() ?? "");
  if (!pdf.ok) return pdf;

  const company = await getCompanyInfo();
  const owing = bill.balance > 0;
  const lines = [
    `Hello ${bill.task.client.name},`,
    "",
    owing
      ? `Your invoice from ${company.name} is attached. The balance is $${bill.balance.toFixed(2)}.`
      : `Your invoice from ${company.name} is attached. Nothing is owing — thank you.`,
    ...(owing && bill.payUrl ? ["", `Pay online: ${bill.payUrl}`] : []),
    ...(company.paymentNote ? ["", company.paymentNote] : []),
    "",
    `Thank you,`,
    company.name,
    ...(company.phone ? [company.phone] : []),
  ];

  try {
    await sendMail({
      to,
      subject: `Invoice from ${company.name}`,
      text: lines.join("\n"),
      attachments: [
        { filename: pdf.data.filename, content: pdf.data.bytes, contentType: "application/pdf" },
      ],
    });
  } catch {
    // The mail server's reason (bad password, rate limit) can carry account
    // details, so it stays out of the message the screen shows.
    return badState("The email couldn't be sent. Check the mail settings and try again.");
  }
  return ok({ sentTo: to });
}
