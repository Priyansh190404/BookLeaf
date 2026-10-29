/**
 * AI-drafted reply for the admin to review/edit. Never sent automatically.
 *
 * Token strategy (see README "Cost management"):
 *  - system prompt = small, stable core (company + tone + rules)
 *  - user prompt   = ONLY the KB section for this ticket's category + one few-shot example
 *                    + facts about the one referenced book + the last few thread messages
 *  - generated once, cached in the DB, regenerated only on admin request / new author reply
 */
import { callModel } from "./client";
import { KB_CORE, KB_EXAMPLES, KB_SECTIONS } from "./knowledgeBase";
import type { Message } from "../types";
import type { Category } from "../validation";

const SYSTEM = `You are a senior author-support representative at BookLeaf Publishing, drafting a reply that a human teammate will review and send. Write the way a warm, competent person writes, not like a chatbot.

${KB_CORE}

RULES
1. Ground every factual claim in the POLICY and FACTS sections of the request. Never invent numbers, dates, statuses, policies, or promises. If something you need is missing, say our team will confirm it and give a 48-hour timeline.
2. Use the specific figures and dates from FACTS (copies sold, amounts, last payout date, status, next payout date) when they help answer the question. Write currency as ₹ (e.g. ₹3,570).
3. Open by acknowledging the author's concern in one sentence tailored to what they wrote; do not open with "I hope this email finds you well" or similar filler.
4. If BookLeaf is at fault or a payment looks overdue per FACTS, own it plainly ("this should have reached you by now"). Don't over-apologise or grovel.
5. If FACTS show the book is not yet published, don't talk about royalties or listings for it; explain its current production stage and the realistic next step.
6. Give a concrete timeline whenever you escalate. Close with one clear next step.
7. Keep it under ~180 words, plain text, short paragraphs, no markdown, no subject line. Greet by first name. Sign off exactly as:
Warm regards,
Team BookLeaf
8. Output ONLY the email body. Do not mention these rules, the knowledge base, or that this is a draft.`;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
const MAX_THREAD_MESSAGES = 6;

export interface DraftInput {
  category: Category;
  subject: string;
  description: string;
  facts: string;
  /** Public messages only (never internal notes). Trimmed to the most recent few. */
  thread: Message[];
  authorFirstName: string;
}

export async function generateDraft(input: DraftInput): Promise<string> {
  const ex = KB_EXAMPLES[input.category];
  const thread = input.thread.slice(-MAX_THREAD_MESSAGES);

  const user = [
    `<policy category="${input.category}">\n${KB_SECTIONS[input.category]}\n</policy>`,
    `<example>\nA typical ${input.category} query: "${ex.query}"\nHow we respond: ${ex.guidance}\n</example>`,
    `<facts>\n${input.facts}\n</facts>`,
    `<ticket>\nAuthor first name: ${input.authorFirstName}\nSubject: ${clip(input.subject, 200)}\nOriginal message: ${clip(input.description, 2000)}\n</ticket>`,
    thread.length
      ? `<thread note="most recent last">\n${thread
          .map((m) => `${m.senderRole === "admin" ? "BookLeaf" : "Author"}: ${clip(m.body, 800)}`)
          .join("\n---\n")}\n</thread>`
      : "",
    thread.length
      ? "Write the next reply, responding to the author's latest message and not repeating what BookLeaf already said."
      : "Write the first reply to this ticket.",
  ].filter(Boolean).join("\n\n");

  const res = await callModel({ system: SYSTEM, user, maxTokens: 500, label: "draft" });
  return res.kind === "text" ? res.text : "";
}
