import { env } from "../env";

/** Thrown for ANY reason the model can't serve a request. Callers degrade gracefully on it. */
export class AiUnavailableError extends Error {
  constructor(public readonly reason: "not_configured" | "rate_limited" | "timeout" | "circuit_open" | "upstream_error" | "bad_output", detail?: string) {
    super(`AI unavailable: ${reason}${detail ? ` (${detail})` : ""}`);
  }
}

// --- tiny circuit breaker: after N consecutive failures, skip the API for a cooldown ---
// Matters most on the free tier, where rate limits are easy to hit: we stop hammering and fall back fast.
const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 60_000;
const breaker = { failures: 0, openUntil: 0 };

const onSuccess = () => { breaker.failures = 0; };
const onFailure = () => {
  if (++breaker.failures >= FAILURE_THRESHOLD) breaker.openUntil = Date.now() + COOLDOWN_MS;
};

interface CallArgs {
  system: string;
  user: string;
  maxTokens: number;
  /** If set, the model must answer with JSON matching this JSON Schema (structured output). */
  jsonSchema?: Record<string, unknown>;
  label: string; // for usage logs
}

export type ModelResult = { kind: "json"; value: unknown } | { kind: "text"; text: string };

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number };
}

export async function callModel(args: CallArgs): Promise<ModelResult> {
  if (!env.geminiApiKey) throw new AiUnavailableError("not_configured");
  if (Date.now() < breaker.openUntil) throw new AiUnavailableError("circuit_open");

  try {
    // Key goes in a header (not the URL) so it never lands in logs. Server-side only.
    const res = await fetch(`${env.geminiBaseUrl}/v1beta/models/${env.aiModel}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.geminiApiKey },
      signal: AbortSignal.timeout(env.aiTimeoutMs),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: args.system }] },
        contents: [{ role: "user", parts: [{ text: args.user }] }],
        generationConfig: {
          maxOutputTokens: args.maxTokens,
          temperature: args.jsonSchema ? 0 : 0.4,
          // Gemini 2.5 "thinking" tokens would eat our small output budget and add cost/latency.
          thinkingConfig: { thinkingBudget: 0 },
          ...(args.jsonSchema && { responseMimeType: "application/json", responseJsonSchema: args.jsonSchema }),
        },
      }),
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      console.warn(`[ai:${args.label}] HTTP ${res.status}: ${detail}`);
      throw new AiUnavailableError(res.status === 429 ? "rate_limited" : "upstream_error", String(res.status));
    }

    const body = (await res.json()) as GeminiResponse;
    const u = body.usageMetadata;
    // Per-call token accounting: makes cost/quota usage visible in logs.
    console.info(`[ai:${args.label}] model=${env.aiModel} in=${u?.promptTokenCount ?? "?"} out=${u?.candidatesTokenCount ?? "?"} cached=${u?.cachedContentTokenCount ?? 0}`);

    const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (!text) throw new AiUnavailableError("bad_output", body.candidates?.[0]?.finishReason ?? "empty response");
    onSuccess();

    if (args.jsonSchema) {
      try { return { kind: "json", value: JSON.parse(text) }; }
      catch { throw new AiUnavailableError("bad_output", "invalid JSON"); }
    }
    return { kind: "text", text };
  } catch (err) {
    onFailure();
    if (err instanceof AiUnavailableError) throw err;
    const name = (err as Error).name;
    if (name === "TimeoutError" || name === "AbortError") throw new AiUnavailableError("timeout");
    console.warn(`[ai:${args.label}] call failed: ${name}: ${(err as Error).message}`);
    throw new AiUnavailableError("upstream_error", name);
  }
}

/** Test hook. */
export const _resetBreaker = () => { breaker.failures = 0; breaker.openUntil = 0; };
