import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { extractToken, verifySession, type Role, type Session } from "../auth/session";
import { ApiError, forbidden, unauthorized } from "./errors";

interface Options {
  /** Roles allowed to call this route. Omit for any authenticated user. */
  roles?: Role[];
  /** Skip authentication (login/health only). */
  public?: boolean;
}

interface Ctx<P> {
  req: NextRequest;
  session: Session;
  params: P;
}

type Handler<P> = (ctx: Ctx<P>) => Promise<unknown>;

/**
 * Wraps a route handler with: authentication, role check, and uniform error handling.
 * Success → `{ data }`. Failure → `{ error: { code, message, details? } }` with a real status code.
 * A handler may return a Response directly (e.g. to set cookies); anything else is wrapped.
 */
export function route<P = Record<string, never>>(opts: Options, handler: Handler<P>) {
  return async (req: NextRequest, routeCtx: { params: Promise<P> }): Promise<Response> => {
    try {
      let session: Session = null as unknown as Session;
      if (!opts.public) {
        const token = extractToken(req);
        const s = token ? await verifySession(token) : null;
        if (!s) throw unauthorized();
        if (opts.roles && !opts.roles.includes(s.role)) throw forbidden();
        session = s;
      }
      const params = (await routeCtx.params) ?? ({} as P);
      const result = await handler({ req, session, params });
      if (result instanceof Response) return result;
      return NextResponse.json({ data: result });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
        },
      },
      { status: 400 },
    );
  }
  // Postgres: malformed uuid in a path param -> treat as "not found", not a 500.
  if (typeof err === "object" && err && (err as { code?: string }).code === "22P02") {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, { status: 404 });
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong on our side. Please try again." } },
    { status: 500 },
  );
}

/** Parse a JSON body, turning malformed JSON into a 400 rather than a 500. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
}
