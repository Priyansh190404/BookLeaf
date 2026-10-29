/**
 * Deterministic royalty-cycle math. We compute dates/thresholds in code and hand the model
 * finished facts, because LLMs are unreliable at date arithmetic and must never invent a payout date.
 *
 * Confirmed with the product owner: quarters follow the Indian financial year (Apr-Mar):
 * Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar. Quarter ends are Jun 30, Sep 30, Dec 31, Mar 31.
 */
const PAYOUT_WINDOW_DAYS = 45;
export const MIN_PAYOUT_INR = 1000;

const QUARTER_ENDS: Array<[month: number, day: number]> = [[2, 31], [5, 30], [8, 30], [11, 31]]; // 0-indexed months

const fmt = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** e.g. a quarter ending 2026-09-30 -> "Q2 FY2026-27". */
export function fyQuarterLabel(quarterEnd: Date): string {
  const m = quarterEnd.getUTCMonth(); // 0-indexed
  const y = quarterEnd.getUTCFullYear();
  const q = ({ 5: 1, 8: 2, 11: 3, 2: 4 } as Record<number, number>)[m];
  const startYear = m >= 3 ? y : y - 1; // FY begins in April
  return `Q${q} FY${startYear}-${String(startYear + 1).slice(2)}`;
}

export interface PayoutCycle {
  /** Most recent quarter that has already ended. */
  lastQuarterLabel: string;
  lastQuarterEnd: string;
  lastQuarterPayoutBy: string;
  /** True while the 45-day window for the last ended quarter is still running. */
  lastQuarterPayoutPending: boolean;
  /** The next date by which a payout is due, and which quarter it covers. */
  nextPayoutBy: string;
  nextPayoutQuarterLabel: string;
}

export function payoutCycle(today: Date = new Date()): PayoutCycle {
  const t = utc(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const ends: Date[] = [];
  for (let y = t.getUTCFullYear() - 1; y <= t.getUTCFullYear() + 1; y++)
    for (const [m, d] of QUARTER_ENDS) ends.push(utc(y, m, d));

  const lastEnd = [...ends].reverse().find((e) => e.getTime() <= t.getTime())!;
  const nextEnd = ends.find((e) => e.getTime() > t.getTime())!;
  const lastBy = addDays(lastEnd, PAYOUT_WINDOW_DAYS);
  const windowRunning = lastBy.getTime() >= t.getTime();

  return {
    lastQuarterLabel: fyQuarterLabel(lastEnd),
    lastQuarterEnd: fmt(lastEnd),
    lastQuarterPayoutBy: fmt(lastBy),
    lastQuarterPayoutPending: windowRunning,
    nextPayoutBy: fmt(windowRunning ? lastBy : addDays(nextEnd, PAYOUT_WINDOW_DAYS)),
    nextPayoutQuarterLabel: windowRunning ? fyQuarterLabel(lastEnd) : fyQuarterLabel(nextEnd),
  };
}

export const daysBetween = (fromIso: string, today: Date = new Date()) =>
  Math.floor((today.getTime() - new Date(fromIso).getTime()) / 86_400_000);
