import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type Session } from "./session";

/** For server components/layouts: the current session, or null. */
export async function getServerSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySession(token) : null;
}
