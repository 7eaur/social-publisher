import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface SecretEnvelope {
  readonly version: 1;
  readonly iv: string;
  readonly ciphertext: string;
  readonly tag: string;
}

export function parseSecretKey(encoded: string | undefined): Buffer {
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
    throw new Error("SECRETS_ENCRYPTION_KEY must be exactly 32 random bytes encoded as base64");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new Error("Invalid SECRETS_ENCRYPTION_KEY");
  }
  return key;
}

/** AES-256-GCM with associated-data binding prevents moving secrets between accounts. */
export function encryptSecret(plaintext: string, key: Buffer, ownerId: string): SecretEnvelope {
  if (!ownerId.trim() || key.length !== 32) throw new RangeError("Invalid encryption context");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm",key,iv);
  cipher.setAAD(Buffer.from("sp:destination:"+ownerId,"utf8"));
  const data = Buffer.concat([cipher.update(plaintext,"utf8"),cipher.final()]);
  return { version:1, iv:iv.toString("base64"),ciphertext:data.toString("base64"),tag:cipher.getAuthTag().toString("base64") };
}

export function decryptSecret(envelope: SecretEnvelope, key: Buffer, ownerId: string): string {
  if (envelope.version !== 1 || !ownerId.trim() || key.length !== 32) throw new RangeError("Invalid decryption context");
  const iv = Buffer.from(envelope.iv,"base64");
  const tag = Buffer.from(envelope.tag,"base64");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid secret metadata");
  const decipher = createDecipheriv("aes-256-gcm",key,iv);
  decipher.setAAD(Buffer.from("sp:destination:"+ownerId,"utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,"base64")),decipher.final()]).toString("utf8");
}
