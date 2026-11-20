import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Encrypt a small secret (the email app password) before it is stored.
 *
 * AES-256-GCM, with a key derived from NEXTAUTH_SECRET by HKDF under its own
 * label — the same way the mobile tokens derive theirs, so no second secret
 * needs managing. A read of the database alone yields nothing usable.
 *
 * Changing NEXTAUTH_SECRET makes stored values unreadable: `open` returns null
 * and email shows as "not set up", so an admin re-enters the password once.
 */

function key(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set.");
  return Buffer.from(hkdfSync("sha256", secret, "", "completepoolapp/smtp-password/v1", 32));
}

const b64 = (b: Buffer) => b.toString("base64url");

/** "v1.<iv>.<tag>.<ciphertext>" */
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", b64(iv), b64(cipher.getAuthTag()), b64(ct)].join(".");
}

/** The original text, or null if it is malformed, tampered with, or sealed under another secret. */
export function open(sealed: string): string | null {
  try {
    const [v, iv, tag, ct] = sealed.split(".");
    if (v !== "v1") return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
