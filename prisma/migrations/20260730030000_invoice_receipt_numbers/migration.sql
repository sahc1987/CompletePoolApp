-- Human-readable document numbers for invoices and receipts.
-- SERIAL backfills existing rows in insertion order, so bills and payments that
-- already exist get numbers too rather than being left null.
ALTER TABLE "Bill" ADD COLUMN "invoiceNo" SERIAL NOT NULL;
CREATE UNIQUE INDEX "Bill_invoiceNo_key" ON "Bill"("invoiceNo");

ALTER TABLE "Payment" ADD COLUMN "receiptNo" SERIAL NOT NULL;
CREATE UNIQUE INDEX "Payment_receiptNo_key" ON "Payment"("receiptNo");
