import { SignJWT, jwtVerify } from "jose";
import { env } from "../env";

export type Role = "author" | "admin";

export interface Session {
  userId: string;
  role: Role;
  name: string;
  email: string;
  authorId: string | null; // set for authors; null for admins
}

export const SESSION_COOKIE = "bl_session";
const MAX_AGE_SECONDS = 60 * 60 * 8;

const key = () => new TextEncoder().encode(env.jwtSecret);

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ role: s.role, name: s.name, email: s.email, authorId: s.authorId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(key());
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.sub || (payload.role !== "author" && payload.role !== "admin")) return null;
    return {
      userId: payload.sub,
      role: payload.role,
      name: String(payload.name ?? ""),
      email: String(payload.email ?? ""),
      authorId: (payload.authorId as string | null) ?? null,
    };
  } catch {
    return null; // expired, tampered, or malformed
  }
}

/** Accepts the httpOnly cookie (browser) or `Authorization: Bearer` (Postman / scripts). */
export function extractToken(req: Request & { cookies?: { get(n: string): { value: string } | undefined } }): string | null {
  const bearer = req.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) return bearer.slice(7);
  return req.cookies?.get(SESSION_COOKIE)?.value ?? null;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
