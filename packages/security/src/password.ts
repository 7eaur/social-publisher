import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 256;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, 64, PARAMS, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

/** Stored format includes algorithm and cost; salt and key are random per user. */
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== "string" || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw new RangeError("Password length must be 12..256 characters");
  }
  const salt = randomBytes(16);
  const hash = await deriveKey(password, salt);
  return ["scrypt",String(PARAMS.N),String(PARAMS.r),String(PARAMS.p),salt.toString("hex"),hash.toString("hex")].join("$");
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (typeof password !== "string" || password.length > PASSWORD_MAX) return false;
  const pieces = encoded.split("$");
  if (pieces.length !== 6 || pieces[0] !== "scrypt") return false;
  const [, nText, rText, pText, saltHex, hashHex] = pieces;
  if (nText !== "16384" || rText !== "8" || pText !== "1") return false;
  if (!saltHex || !hashHex || !/^[a-f0-9]{32}$/.test(saltHex) || !/^[a-f0-9]{128}$/.test(hashHex)) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await deriveKey(password, Buffer.from(saltHex, "hex"));
  return timingSafeEqual(actual, expected);
}
