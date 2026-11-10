/** @jest-environment node */
import { cronRequestAllowed } from "../cronAuth";

const env = process.env as Record<string, string | undefined>;
const original = { secret: env.CRON_SECRET, nodeEnv: env.NODE_ENV };

const req = (headers: Record<string, string> = {}, url = "https://x.test/api/cron/recurrence") =>
  new Request(url, { headers });

afterEach(() => {
  env.CRON_SECRET = original.secret;
  env.NODE_ENV = original.nodeEnv;
});

describe("cronRequestAllowed", () => {
  it("accepts the bearer secret", () => {
    env.CRON_SECRET = "s3cret";
    expect(cronRequestAllowed(req({ authorization: "Bearer s3cret" }))).toBe(true);
  });

  it("denies a wrong or missing secret", () => {
    env.CRON_SECRET = "s3cret";
    expect(cronRequestAllowed(req({ authorization: "Bearer nope" }))).toBe(false);
    expect(cronRequestAllowed(req())).toBe(false);
  });

  it("no longer accepts the secret in the query string", () => {
    env.CRON_SECRET = "s3cret";
    expect(cronRequestAllowed(req({}, "https://x.test/api/cron/recurrence?key=s3cret"))).toBe(false);
  });

  it("fails closed in production when the secret is unset", () => {
    delete env.CRON_SECRET;
    env.NODE_ENV = "production";
    expect(cronRequestAllowed(req())).toBe(false);
  });

  it("stays open in development when the secret is unset", () => {
    delete env.CRON_SECRET;
    env.NODE_ENV = "development";
    expect(cronRequestAllowed(req())).toBe(true);
  });
});
