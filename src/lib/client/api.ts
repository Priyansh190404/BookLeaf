import type { ApiErrorBody } from "../types";

export class ApiClientError extends Error {
  constructor(message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

async function request(url: string, init?: RequestInit & { json?: unknown }): Promise<{ data: unknown; meta?: { total: number } }> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.json !== undefined && { "Content-Type": "application/json" }), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !url.includes("/auth/login")) window.location.href = "/login";
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiClientError(err?.message ?? `Request failed (${res.status})`, res.status, err?.details);
  }
  return body as { data: unknown; meta?: { total: number } };
}

/** Fetch wrapper: unwraps `{data}`, throws ApiClientError with the server's message, bounces to /login on 401. */
export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  return (await request(url, init)).data as T;
}

/** For paginated list endpoints: returns the page plus the total match count. */
export async function apiList<T>(url: string): Promise<{ items: T[]; total: number }> {
  const body = await request(url);
  return { items: body.data as T[], total: body.meta?.total ?? (body.data as T[]).length };
}

/** Upload one file as multipart/form-data. */
export const uploadFile = (url: string, file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return api<{ id: string }>(url, { method: "POST", body: fd });
};
