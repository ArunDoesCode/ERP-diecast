/**
 * Generates a raw 64-character hex token for operator QR login.
 * The raw value is returned to the caller exactly once; only its
 * Bun.password.hash() digest is persisted (see employeeService).
 */
export function generateRawQrToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("hex");
}
