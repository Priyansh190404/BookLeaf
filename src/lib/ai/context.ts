/**
 * Builds the compact FACTS block for the drafting prompt from the database.
 * Only the referenced book (or a one-line-per-book summary for account-level tickets) is sent,
 * never the author's full history.
 */
import type { BookRow } from "../repositories/books";
import { MIN_PAYOUT_INR, daysBetween, payoutCycle } from "./payouts";

const inr = (n: number | null) => (n === null ? "not set" : `Rs ${n.toLocaleString("en-IN")}`);

export function describeBook(b: BookRow, today = new Date()): string {
  if (!b.status.startsWith("Published")) {
    return [
      `Book: "${b.title}" (${b.id})`,
      `Status: ${b.status} (NOT yet published: no sales, no royalties, no live listings, MRP not set)`,
      `ISBN: ${b.isbn ?? "not assigned"}`,
    ].join("\n");
  }
  const cycle = payoutCycle(today);
  const lines = [
    `Book: "${b.title}" (${b.id}), ${b.genre ?? "genre n/a"}`,
    `Status: ${b.status}; published ${b.publication_date} (${daysBetween(b.publication_date!, today)} days ago)`,
    `ISBN: ${b.isbn}; print partner: ${b.print_partner ?? "n/a"}; listed on: ${b.available_on.join(", ") || "none"}`,
    `MRP: ${inr(b.mrp)}; author royalty per copy: ${inr(b.author_royalty_per_copy)}; copies sold: ${b.total_copies_sold}`,
    `Royalty earned: ${inr(b.total_royalty_earned)}; paid: ${inr(b.royalty_paid)}; pending: ${inr(b.royalty_pending)}`,
    b.last_royalty_payout_date
      ? `Last payout: ${b.last_royalty_payout_date} (${daysBetween(b.last_royalty_payout_date, today)} days ago)`
      : `Last payout: NONE (this book has never been paid out)`,
  ];
  if (b.royalty_pending > 0) {
    lines.push(
      b.royalty_pending < MIN_PAYOUT_INR
        ? `Payout eligibility: pending ${inr(b.royalty_pending)} is BELOW the Rs 1,000 minimum, so it rolls over to the next quarter.`
        : `Payout eligibility: pending ${inr(b.royalty_pending)} is above the Rs 1,000 minimum.`,
    );
  }
  lines.push(
    `Royalty cycle today (Indian financial-year quarters): last quarter, ${cycle.lastQuarterLabel}, ended ${cycle.lastQuarterEnd}; payout for it due by ${cycle.lastQuarterPayoutBy}` +
      (cycle.lastQuarterPayoutPending ? " (window still open)" : " (window has closed)") +
      `; next payout date: ${cycle.nextPayoutBy} (covers ${cycle.nextPayoutQuarterLabel})`,
  );
  return lines.join("\n");
}

/** One compact line per book: used for account-level tickets. */
export function summariseBook(b: BookRow): string {
  const published = b.status.startsWith("Published");
  return published
    ? `- "${b.title}" (${b.id}): ${b.status}; sold ${b.total_copies_sold}; royalty earned ${inr(b.total_royalty_earned)}, paid ${inr(b.royalty_paid)}, pending ${inr(b.royalty_pending)}; last payout ${b.last_royalty_payout_date ?? "none"}`
    : `- "${b.title}" (${b.id}): ${b.status} (not yet published)`;
}

export function buildFacts(opts: { authorName: string; book: BookRow | null; allBooks: BookRow[]; today?: Date }): string {
  const today = opts.today ?? new Date();
  const header = `Today: ${today.toISOString().slice(0, 10)}\nAuthor: ${opts.authorName}`;
  if (opts.book) return `${header}\n${describeBook(opts.book, today)}`;
  const list = opts.allBooks.length ? opts.allBooks.map(summariseBook).join("\n") : "- (no books on file)";
  const cycle = payoutCycle(today);
  return `${header}\nAccount-level query. Author's books:\n${list}\nNext payout date: ${cycle.nextPayoutBy} (covers ${cycle.nextPayoutQuarterLabel})`;
}

/** One-line book evidence for the triage prompt (much smaller than the drafting facts). */
export function triageBookContext(b: BookRow): string {
  if (!b.status.startsWith("Published")) return `"${b.title}": ${b.status} (not yet published)`;
  return `"${b.title}": ${b.status}, published ${b.publication_date}, sold ${b.total_copies_sold}, pending ${inr(b.royalty_pending)}, ` +
    (b.last_royalty_payout_date ? `last paid ${b.last_royalty_payout_date}` : "never paid out");
}
