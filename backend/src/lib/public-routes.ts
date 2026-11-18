// BR-STD-36 / BR-STD-42: the routes that need no token. A database conflict on
// one of these never answers 409 (it would tell an anonymous caller that a
// record exists). A fifth entry needs an owner-approved spec line.
export const PUBLIC_PATHS: readonly string[] = [
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/health",
];

export function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.includes(path);
}
