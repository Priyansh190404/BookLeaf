import { NextResponse } from "next/server";
import { DUMMY_HASH, verifyPassword } from "@/lib/auth/password";
import { clearLoginFailures, loginAllowed, recordLoginFailure } from "@/lib/auth/rateLimit";
import { SESSION_COOKIE, sessionCookieOptions, signSession, type Session } from "@/lib/auth/session";
import { ApiError } from "@/lib/http/errors";
import { readJson, route } from "@/lib/http/route";
import { findUserByEmail } from "@/lib/repositories/users";
import { loginSchema } from "@/lib/validation";

export const POST = route({ public: true }, async ({ req }) => {
  const { email, password } = loginSchema.parse(await readJson(req));

  // Throttle repeated failures per IP + email (brute-force protection).
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const key = `${ip}|${email}`;
  const gate = loginAllowed(key);
  if (!gate.allowed) {
    const mins = Math.ceil(gate.retryAfterSec / 60);
    throw new ApiError(429, "TOO_MANY_ATTEMPTS", `Too many failed sign-in attempts. Try again in ${mins} minute${mins > 1 ? "s" : ""}.`);
  }

  const user = await findUserByEmail(email);
  // Always run a bcrypt compare so unknown emails cost the same as wrong passwords.
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) {
    recordLoginFailure(key);
    throw new ApiError(401, "INVALID_CREDENTIALS", "Incorrect email or password");
  }
  clearLoginFailures(key);

  const session: Session = { userId: user.id, role: user.role, name: user.name, email: user.email, authorId: user.author_id };
  const res = NextResponse.json({ data: session });
  res.cookies.set(SESSION_COOKIE, await signSession(session), sessionCookieOptions);
  return res;
});
