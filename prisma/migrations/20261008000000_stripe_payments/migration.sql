-- Online card payments through Stripe Checkout.

-- The secret in each bill's customer pay link (/pay/<payToken>). The default is
-- volatile, so Postgres evaluates it per row: every existing bill gets its own
-- random token as the column is added. gen_random_uuid() is built into
-- Postgres 13+, no extension needed.
ALTER TABLE "Bill" ADD COLUMN     "payToken" TEXT NOT NULL DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text);

-- The bill's current Checkout Session, reused while open so the customer can't
-- start a second checkout and pay twice.
ALTER TABLE "Bill" ADD COLUMN     "checkoutSessionId" TEXT;

-- The Stripe PaymentIntent a payment came from. Unique so a payment Stripe
-- reports more than once is recorded once.
ALTER TABLE "Payment" ADD COLUMN     "stripePaymentIntentId" TEXT;

CREATE UNIQUE INDEX "Bill_payToken_key" ON "Bill"("payToken");

CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");
