import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { logger } from "../lib/logger.js";

const ALGO = "aes-256-cbc";

// ─── Key derivation ──────────────────────────────────────────────────────────

/**
 * NEW (current) key derivation: SHA-256 of the raw secret.
 * Always produces exactly 32 bytes regardless of input length / encoding.
 */
function deriveKey(): Buffer {
  const raw = getRawSecret();
  if (!raw) return deriveDevKey();
  return createHash("sha256").update(raw).digest();
}

/**
 * LEGACY key derivation used by code written before the SHA-256 migration.
 * The old code did Buffer.from(raw.slice(0, 32), "utf8") which works only for
 * ASCII secrets whose first 32 characters are all single-byte.
 *
 * Returns null when the legacy derivation would not produce exactly 32 bytes
 * (e.g. short secret, multi-byte chars, or no secret set).
 */
function deriveLegacyKey(): Buffer | null {
  const raw = getRawSecret();
  if (!raw) {
    // Old dev fallback: "tj-dev-key-only-not-for-prod-!!" — 31 chars → 31 bytes
    // which is invalid for AES-256, so the legacy dev path was always broken.
    // Return null; we cannot recover credentials encrypted with a broken key.
    return null;
  }

  if (raw.length < 32) return null;

  try {
    const buf = Buffer.from(raw.slice(0, 32), "utf8");
    if (buf.length !== 32) return null; // multi-byte chars → fewer than 32 bytes
    return buf;
  } catch {
    return null;
  }
}

function getRawSecret(): string | undefined {
  return (
    process.env["BROKER_ENCRYPTION_KEY"] ??
    process.env["ENCRYPTION_SECRET"] ??
    undefined
  );
}

function deriveDevKey(): Buffer {
  logger.warn(
    "BrokerEncryption: no BROKER_ENCRYPTION_KEY set — using insecure dev key. " +
    "Set BROKER_ENCRYPTION_KEY in Replit Secrets before deploying.",
  );
  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "BROKER_ENCRYPTION_KEY (or ENCRYPTION_SECRET) env var must be set in production. " +
      "Generate a strong value with: openssl rand -hex 32",
    );
  }
  // Hash the dev key string so it's always exactly 32 bytes, matching the
  // same code path used in production.
  return createHash("sha256").update("tj-dev-insecure-key-not-for-prod").digest();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseHexParts(ciphertext: string): { iv: Buffer; enc: Buffer } | null {
  const colonIdx = ciphertext.indexOf(":");
  if (colonIdx === -1) return null;

  const ivHex  = ciphertext.slice(0, colonIdx);
  const encHex = ciphertext.slice(colonIdx + 1);

  if (!ivHex || !encHex) return null;
  if (ivHex.length !== 32) return null; // 16 bytes = 32 hex chars

  try {
    return { iv: Buffer.from(ivHex, "hex"), enc: Buffer.from(encHex, "hex") };
  } catch {
    return null;
  }
}

function tryDecrypt(key: Buffer, iv: Buffer, enc: Buffer): string | null {
  try {
    const decipher  = createDecipheriv(ALGO, key, iv);
    const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string with AES-256-CBC.
 * Output format: "<iv-hex>:<ciphertext-hex>"
 */
export function encrypt(plaintext: string): string {
  if (typeof plaintext !== "string") {
    throw new TypeError("encrypt: plaintext must be a string");
  }

  const key = deriveKey();
  const iv  = randomBytes(16);

  const cipher    = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

/**
 * Decrypt a ciphertext produced by encrypt().
 *
 * Tries the current SHA-256 key derivation first. If that fails, attempts the
 * legacy slice-to-32 derivation used before the SHA-256 migration, so that
 * credentials stored with the old algorithm continue to work.
 *
 * Throws only when ALL derivation strategies have been exhausted.
 */
export function decrypt(ciphertext: string): string {
  if (typeof ciphertext !== "string" || !ciphertext.includes(":")) {
    throw new Error(
      "BrokerEncryption.decrypt: malformed ciphertext — expected \"<iv-hex>:<data-hex>\"",
    );
  }

  const parts = parseHexParts(ciphertext);
  if (!parts) {
    throw new Error(
      "BrokerEncryption.decrypt: invalid ciphertext format — " +
      "bad IV length or non-hex characters",
    );
  }

  const { iv, enc } = parts;

  // ── Attempt 1: current SHA-256 key ─────────────────────────────────────────
  const currentKey  = deriveKey();
  const currentResult = tryDecrypt(currentKey, iv, enc);
  if (currentResult !== null) return currentResult;

  // ── Attempt 2: legacy slice-to-32 key ─────────────────────────────────────
  // Used by the codebase before the SHA-256 migration. Only possible when the
  // raw secret is at least 32 ASCII characters long.
  const legacyKey = deriveLegacyKey();
  if (legacyKey) {
    const legacyResult = tryDecrypt(legacyKey, iv, enc);
    if (legacyResult !== null) {
      logger.warn(
        "BrokerEncryption.decrypt: decrypted with LEGACY key derivation. " +
        "Reconnect this broker account to re-encrypt with the current algorithm.",
      );
      return legacyResult;
    }
  }

  // ── All strategies failed ──────────────────────────────────────────────────
  throw new Error(
    "BrokerEncryption.decrypt: decryption failed with all key derivations. " +
    "Possible causes: wrong BROKER_ENCRYPTION_KEY, data encrypted on a different " +
    "server, or corrupted storage. Reconnect the broker account to fix this.",
  );
}
