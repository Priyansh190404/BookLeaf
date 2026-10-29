import assert from "node:assert/strict";
import { test } from "node:test";
import { payoutCycle } from "../src/lib/ai/payouts";

test("inside the 45-day window: next payout is the last quarter's due date", () => {
  const c = payoutCycle(new Date("2026-10-27T10:00:00Z"));
  assert.equal(c.lastQuarterEnd, "2026-09-30");
  assert.equal(c.lastQuarterPayoutBy, "2026-11-14");
  assert.equal(c.lastQuarterPayoutPending, true);
  assert.equal(c.nextPayoutBy, "2026-11-14");
});

test("after the window closes: next payout is for the following quarter", () => {
  const c = payoutCycle(new Date("2026-12-01T00:00:00Z"));
  assert.equal(c.lastQuarterPayoutPending, false);
  assert.equal(c.nextPayoutBy, "2027-02-14"); // Dec 31 + 45 days
});

test("on the quarter-end day itself, that quarter counts as ended", () => {
  assert.equal(payoutCycle(new Date("2026-03-31T00:00:00Z")).lastQuarterEnd, "2026-03-31");
});

test("year boundary", () => {
  const c = payoutCycle(new Date("2026-01-10T00:00:00Z"));
  assert.equal(c.lastQuarterEnd, "2025-12-31");
  assert.equal(c.nextPayoutBy, "2026-02-14");
});

test("financial-year labels (Apr-Mar)", () => {
  assert.equal(payoutCycle(new Date("2026-10-27T00:00:00Z")).lastQuarterLabel, "Q2 FY2026-27");
  assert.equal(payoutCycle(new Date("2026-01-10T00:00:00Z")).lastQuarterLabel, "Q3 FY2025-26");
  assert.equal(payoutCycle(new Date("2026-04-20T00:00:00Z")).lastQuarterLabel, "Q4 FY2025-26");
  assert.equal(payoutCycle(new Date("2026-12-01T00:00:00Z")).nextPayoutQuarterLabel, "Q3 FY2026-27");
});
