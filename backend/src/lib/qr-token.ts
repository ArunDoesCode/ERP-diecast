import { sha256 } from "./token";

/**
 * Generates a raw 64-character hex token for operator QR login.
 * The raw value is returned to the caller exactly once; only its digest is
 * persisted (see employeeService).
 */
export function generateRawQrToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("hex");
}

/**
 * Digest stored in `employees.qr_token` (BR-AUTH-29). The raw token is 256
 * random bits, so a plain SHA-256 is safe (no dictionary to guess from) and,
 * unlike a salted password hash, lets QR login find the employee with one
 * indexed lookup. Same approach as the refresh-token hash.
 */
export function hashQrToken(rawQrToken: string): Promise<string> {
  return sha256(rawQrToken);
}
