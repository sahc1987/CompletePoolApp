-- Business identity for invoices and receipts. Previously the company name was
-- hardcoded in the PDF component and there was no address, phone, or tax id at
-- all — enough to look like a draft rather than a document a customer can pay
-- from or file.
ALTER TABLE "AppSettings"
  ADD COLUMN IF NOT EXISTS "companyName"    TEXT NOT NULL DEFAULT 'Complete Pool Service Inc.',
  ADD COLUMN IF NOT EXISTS "companyTagline" TEXT,
  ADD COLUMN IF NOT EXISTS "companyAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "companyPhone"   TEXT,
  ADD COLUMN IF NOT EXISTS "companyEmail"   TEXT,
  ADD COLUMN IF NOT EXISTS "companyWebsite" TEXT,
  ADD COLUMN IF NOT EXISTS "companyTaxId"   TEXT,
  ADD COLUMN IF NOT EXISTS "paymentTerms"   TEXT NOT NULL DEFAULT 'Due upon receipt',
  ADD COLUMN IF NOT EXISTS "paymentNote"    TEXT,
  ADD COLUMN IF NOT EXISTS "documentFooter" TEXT;
