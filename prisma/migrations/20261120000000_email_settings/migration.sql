-- Outgoing email login, set up under Settings -> Email. All nullable: until an
-- admin completes setup (a successful test login) these stay empty and the
-- "Email invoice" button explains email isn't set up. The password is stored
-- encrypted (AES-256-GCM), never as plain text.
ALTER TABLE "AppSettings" ADD COLUMN     "smtpFrom" TEXT,
ADD COLUMN     "smtpPassEnc" TEXT,
ADD COLUMN     "smtpUser" TEXT;
