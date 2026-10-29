/**
 * Central, typed access to environment variables. Everything here is server-only:
 * nothing is prefixed NEXT_PUBLIC_, so none of it can reach the browser bundle.
 */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export const env = {
  get databaseUrl() { return required("DATABASE_URL"); },
  get pgSsl() { return process.env.PGSSL === "true"; },
  get jwtSecret() {
    const s = required("JWT_SECRET");
    if (s.length < 16) throw new Error("JWT_SECRET must be at least 16 characters");
    return s;
  },
  // Optional: with no key the app runs in manual mode (see lib/ai/client.ts).
  get geminiApiKey() { return process.env.GEMINI_API_KEY || ""; },
  get geminiBaseUrl() { return process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com"; },
  get aiModel() { return process.env.AI_MODEL || "gemini-3.6-flash"; },
  get aiTimeoutMs() { return Number(process.env.AI_TIMEOUT_MS) || 15000; },
};
