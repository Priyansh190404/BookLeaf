/**
 * Auto-classification + priority scoring.
 * One cheap structured call (small prompt, NO knowledge base, schema-constrained JSON output) per new ticket,
 * with a deterministic keyword fallback so every ticket gets *some* triage even if the AI is down.
 */
import { z } from "zod";
import { AiUnavailableError, callModel } from "./client";
import { CATEGORIES, PRIORITIES, type Category, type Priority } from "../validation";

export interface Triage {
  category: Category;
  priority: Priority;
  rationale: string | null;
  source: "ai" | "fallback";
}

export interface TriageInput {
  subject: string;
  description: string;
  /** One-line book context, e.g. `"Title" - Published & Live, pending Rs 2546, never paid`. */
  bookContext: string | null;
}

const SYSTEM = `You triage support tickets for BookLeaf Publishing, a self-publishing company in India/US. Authors write in about royalties, ISBNs, printing, distribution and book production.

Pick exactly one CATEGORY:
- Royalty & Payments: royalty amounts, missing/late payouts, payout schedule, bank details
- ISBN & Metadata Issues: wrong/duplicate ISBN, wrong book linked, title/description/author-name metadata
- Printing & Quality: misprints, binding, colour, blurry images, reprints, print turnaround
- Distribution & Availability: not listed, "unavailable", wrong platform listing, stock sync
- Book Status & Production Updates: where the book is in editing/cover/typesetting/proofing, timelines
- General Inquiry: anything else (bio changes, how-to, account questions)
If a ticket spans several, choose the one that needs action first.

Assign PRIORITY by impact on the author and urgency:
- Critical: significant money overdue (e.g. no royalty for many months / far beyond the quarterly+45-day cycle), a LIVE book not purchasable anywhere, legal/public-escalation threats, wrong ISBN causing the wrong book to be sold.
- High: ISBN/metadata errors (company policy: always at least High), defective printed copies, royalty amount disputes, payout overdue by a modest margin, repeated follow-ups from an upset author.
- Medium: production-stage delay questions, availability on a single platform, general questions with a deadline.
- Low: informational or how-to questions, cosmetic changes (e.g. updating author bio), thanks/feedback.
Use the book context for evidence (e.g. a never-paid published book raises royalty priority; an unpublished book cannot have royalties or listings). Judge from content, not tone alone.

Write "rationale" as one short sentence (max 20 words) an ops agent can scan.`;

// Enum-constrained JSON schema: the model can only return valid categories/priorities.
const SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", enum: [...CATEGORIES] },
    priority: { type: "string", enum: [...PRIORITIES] },
    rationale: { type: "string" },
  },
  required: ["category", "priority", "rationale"],
};

const outputSchema = z.object({
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  rationale: z.string().max(300),
});

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

export async function triageTicket(input: TriageInput): Promise<Triage> {
  try {
    const user =
      `Book context: ${input.bookContext ?? "General / account-level (no specific book)"}\n` +
      `Subject: ${clip(input.subject, 200)}\nDescription: ${clip(input.description, 1500)}`;
    const res = await callModel({ system: SYSTEM, user, maxTokens: 200, jsonSchema: SCHEMA, label: "triage" });
    const parsed = outputSchema.safeParse(res.kind === "json" ? res.value : null);
    if (!parsed.success) throw new AiUnavailableError("bad_output", "schema mismatch");
    return { ...parsed.data, source: "ai" };
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) throw err;
    return fallbackTriage(input);
  }
}

// ---------- deterministic fallback ----------

const CATEGORY_RULES: Array<[Category, RegExp]> = [
  ["ISBN & Metadata Issues", /\bisbn\b|metadata|wrong book|duplicate/i],
  ["Royalty & Payments", /royalt|payout|payment|paid|bank|earning|commission/i],
  ["Printing & Quality", /print|binding|misalign|blurry|quality|reprint|damaged|defect/i],
  ["Distribution & Availability", /unavailable|not (showing|listed|available)|listing|stock sync|out of stock/i],
  ["Book Status & Production Updates", /typeset|cover design|proofread|editing|production|when will|status of my book/i],
];

export function fallbackTriage(input: Pick<TriageInput, "subject" | "description">): Triage {
  const text = `${input.subject}\n${input.description}`;
  const category = CATEGORY_RULES.find(([, re]) => re.test(text))?.[0] ?? "General Inquiry";

  let priority: Priority = "Medium";
  if (/legal|lawyer|refund|fraud|cheat|never (received|got)|haven'?t (received|got)|\b\d+\s*months?\b/i.test(text) && category === "Royalty & Payments") priority = "Critical";
  else if (category === "ISBN & Metadata Issues" || /terrible|defect|urgent|angry|unacceptable|misprint/i.test(text)) priority = "High";
  else if (category === "General Inquiry" && /bio|how (do|can) i|update|thank/i.test(text)) priority = "Low";

  return { category, priority, rationale: "Keyword-based triage (AI unavailable). Please review.", source: "fallback" };
}
