/**
 * BookLeaf Knowledge Base, split by category so each drafting call sends ONLY the policy
 * sections relevant to the ticket (plus the small always-on core) instead of the whole KB.
 * Content mirrors the policies supplied in the assignment brief.
 */
import type { Category } from "../validation";

/** Always included: who we are + how we talk. Stable text => cacheable system prompt prefix. */
export const KB_CORE = `COMPANY
- BookLeaf Publishing is a self-publishing company operating in India and the US.
- Packages: Standard Free (no upfront cost) and Bestseller Breakthrough (premium, paid; marketing and distribution add-ons).
- We handle cover design, typesetting, ISBN assignment, printing, distribution and royalty management.
- In-house printing facility and warehouse are in Delhi. Print partners: Repro India and Epitome Books.

TONE GUIDELINES
- Always empathetic and professional. Authors are our partners, not customers to be managed.
- Acknowledge the author's concern before jumping to solutions.
- Be specific: use actual numbers, dates and statuses instead of vague reassurance.
- If something is BookLeaf's fault (delayed royalties, ISBN error), own it directly. No corporate deflection.
- If the issue needs escalation or investigation, give a clear timeline (e.g. "Our team will look into this and get back to you within 48 hours"), never an open-ended promise.
- Always end with a clear next step for the author and/or the BookLeaf team.`;

export const KB_SECTIONS: Record<Category, string> = {
  "Royalty & Payments": `ROYALTY POLICY
- 80/20 split: 80% of net profit per book goes to the author, 20% to BookLeaf.
- Net profit = MRP minus printing cost, platform commission (Amazon/Flipkart) and shipping charges.
- Royalties are calculated quarterly and paid within 45 days of the quarter ending.
- Minimum payout threshold: Rs 1,000. Below that, the amount rolls over to the next quarter.
- Payouts are made by bank transfer to the account linked in the author's dashboard.
- Authors can see a detailed royalty breakdown (sales per platform) in their dashboard.`,

  "ISBN & Metadata Issues": `ISBN POLICY
- Every book published through BookLeaf gets a unique ISBN assigned by BookLeaf, registered under BookLeaf's publisher imprint.
- An author who wants an ISBN under their own imprint must obtain it independently.
- ISBN errors (duplicate, wrong book linked) are HIGH priority and escalated to the production team.
METADATA UPDATES
- Metadata (e.g. description) updates can be submitted through the dashboard or by emailing the BookLeaf team; changes typically reflect on platforms within 3-5 business days.`,

  "Printing & Quality": `PRINTING & QUALITY
- In-house printing handles most orders; overflow or special formats go to Repro India or Epitome Books.
- Standard print turnaround: 5-7 business days from order confirmation.
- Quality issues (misprints, binding defects, colour inconsistency): BookLeaf arranges a FREE reprint after verification. The author may need to share photos of the defective copy.`,

  "Distribution & Availability": `DISTRIBUTION & AVAILABILITY
- Books are listed on Amazon India, Flipkart, Amazon US, Amazon UK and the BookLeaf Store.
- New listings typically go live 7-10 business days after publication is complete.
- A book showing as unavailable on a platform usually indicates a stock sync issue; the team can trigger a re-sync, which takes 24-48 hours.`,

  "Book Status & Production Updates": `PRODUCTION STAGES
- Manuscript Received -> Editing (if opted) -> Cover Design -> Typesetting -> Proofreading -> ISBN Assignment -> Printing -> Distribution Setup -> Published & Live.
- Authors are emailed at each stage. Delays typically happen at Cover Design (waiting for author approval) and Proofreading (revision rounds).
- If a delay is on the author's side, never blame them; frame it collaboratively.`,

  "General Inquiry": `GENERAL
- Metadata updates (e.g. book description on Amazon after going live) can be submitted through the dashboard or by emailing the BookLeaf team; changes typically reflect on platforms within 3-5 business days.
- If the question is outside the policies above, do not guess: say the team will confirm and give a 48-hour timeline.`,
};

/** One calibrating example per category (from the brief). Few-shot, kept short on purpose. */
export const KB_EXAMPLES: Record<Category, { query: string; guidance: string }> = {
  "Royalty & Payments": {
    query: "I published my book 4 months ago and still haven't received any royalty. What's going on?",
    guidance: "Acknowledge the frustration. Explain the quarterly cycle and 45-day payout window. Check bank details are linked. Give the specific next payout date. If genuinely overdue, escalate with a 48-hour resolution timeline. For 'amount seems too low' queries: explain net profit (MRP minus printing, platform commission, shipping), offer a line-by-line breakdown, don't be defensive.",
  },
  "ISBN & Metadata Issues": {
    query: "My book is showing a different ISBN on Amazon than what's on the physical copy.",
    guidance: "Treat as high priority. Acknowledge this is a serious data issue. Confirm escalation to the production team immediately. Provide a 48-hour resolution timeline.",
  },
  "Printing & Quality": {
    query: "I received my author copies and the print quality is terrible. Images are blurry and pages are misaligned.",
    guidance: "Apologise sincerely. Ask for photos of the defective copies. Confirm a free reprint once verified. Give a 5-7 business day timeline for the reprint.",
  },
  "Distribution & Availability": {
    query: "My book is published but it's showing as 'Currently Unavailable' on Amazon.",
    guidance: "Explain this is typically a stock sync issue. Confirm you're triggering a re-sync with the distribution team. Set expectation: 24-48 hours to go live again.",
  },
  "Book Status & Production Updates": {
    query: "It's been 3 weeks and my book is still in typesetting. When will it be done?",
    guidance: "Use the actual production status. If delayed, be honest about why (e.g. waiting on proof approval). Give a specific updated timeline. Don't blame the author; frame collaboratively.",
  },
  "General Inquiry": {
    query: "Can I update the description of my book on Amazon after it's already live?",
    guidance: "Yes: via the dashboard or by emailing the BookLeaf team. Changes typically reflect within 3-5 business days.",
  },
};
