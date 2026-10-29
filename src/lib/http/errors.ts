/** Typed API error: the route wrapper turns these into structured JSON responses. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new ApiError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Authentication required") => new ApiError(401, "UNAUTHENTICATED", message);
export const forbidden = (message = "You do not have access to this resource") => new ApiError(403, "FORBIDDEN", message);
export const notFound = (what = "Resource") => new ApiError(404, "NOT_FOUND", `${what} not found`);
export const conflict = (message: string) => new ApiError(409, "CONFLICT", message);
