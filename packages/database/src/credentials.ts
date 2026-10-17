import type { Pool } from "pg";
import { encryptSecret,decryptSecret,type SecretEnvelope } from "../../security/src/secrets.ts";

/**
 * Ciphertext-only DB adapter. Key material is provided from the deployment's
 * secret manager at runtime and is never stored alongside the ciphertext.
 */
export async function saveDestinationCredential(
  pool:Pool,destinationId:string,plaintext:string,key:Buffer
):Promise<boolean>{
  if (!plaintext || Buffer.byteLength(plaintext,"utf8") > 16384) {
    throw new RangeError("Credential must be a nonempty value up to 16KiB");
  }
  const encoded=encryptSecret(plaintext,key,destinationId);
  const result=await pool.query(
    `UPDATE destinations SET
      credentials_ciphertext=$2,credentials_iv=$3,
      credentials_tag=$4,credentials_version=$5
     WHERE id=$1::uuid`,
    [
      destinationId,
      Buffer.from(encoded.ciphertext,"base64"),
      Buffer.from(encoded.iv,"base64"),
      Buffer.from(encoded.tag,"base64"),
      encoded.version
    ]
  );
  return result.rowCount===1;
}

export async function readDestinationCredential(
  pool:Pool,destinationId:string,key:Buffer
):Promise<string|null>{
  const result=await pool.query<{
    credentials_ciphertext:Buffer|null;
    credentials_iv:Buffer|null;
    credentials_tag:Buffer|null;
    credentials_version:number|null;
  }>(
    `SELECT credentials_ciphertext,credentials_iv,credentials_tag,credentials_version
     FROM destinations WHERE id=$1::uuid`,[destinationId]
  );
  const row=result.rows[0];
  if (!row || !row.credentials_ciphertext) return null;
  if (!row.credentials_iv || !row.credentials_tag || row.credentials_version!==1) {
    throw new Error("Invalid stored encrypted credential envelope");
  }
  const envelope:SecretEnvelope={
    version:1,
    ciphertext:row.credentials_ciphertext.toString("base64"),
    iv:row.credentials_iv.toString("base64"),
    tag:row.credentials_tag.toString("base64")
  };
  return decryptSecret(envelope,key,destinationId);
}
