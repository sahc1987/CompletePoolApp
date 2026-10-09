import type { PdfFile } from "@/server/services/billDocuments";

/**
 * A rendered document as a download. `private, no-store` because it carries a
 * customer's name, address and balance, and the balance changes.
 */
export function pdfResponse(file: PdfFile): Response {
  return new Response(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${file.filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
