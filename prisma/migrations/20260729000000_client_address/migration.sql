-- Client's own billing/mailing address. Nullable so existing rows stay valid.
ALTER TABLE "Client" ADD COLUMN "address" TEXT;
