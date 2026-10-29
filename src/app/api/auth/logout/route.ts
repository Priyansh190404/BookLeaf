import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { route } from "@/lib/http/route";

export const POST = route({}, async () => {
  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});
