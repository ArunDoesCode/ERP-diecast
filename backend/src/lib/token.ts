import { jwtVerify, SignJWT } from "jose";

import { env } from "./env";

export type Role =
  | "owner"
  | "back_office"
  | "floor_supervisor"
  | "qa_inspector"
  | "die_designer"
  | "operator"
  | "super-admin";

export type TokenPayload = {
  userId: number | string;
  userName: string;
  role: Role;
  allowedPages: string[];

};

const accessSecret = new TextEncoder().encode(env.ACCESS_TOKEN_SECRET);
const refreshSecret = new TextEncoder().encode(env.REFRESH_TOKEN_SECRET);

export async function signAccessToken(payload: TokenPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(accessSecret);
}

export async function signRefreshToken(payload: TokenPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${env.REFRESH_TOKEN_TTL_SECONDS}s`)
    .sign(refreshSecret);
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, accessSecret);
  return payload as TokenPayload;
}

export async function verifyRefreshToken(token: string) {
  const { payload } = await jwtVerify(token, refreshSecret);
  return payload as TokenPayload;
}

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Buffer.from(hash).toString("hex");
}
