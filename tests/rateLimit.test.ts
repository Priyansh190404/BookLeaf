import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { MAX_FAILURES, _resetRateLimit, clearLoginFailures, loginAllowed, recordLoginFailure } from "../src/lib/auth/rateLimit";

beforeEach(_resetRateLimit);

test("locks out after MAX_FAILURES within the window", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < MAX_FAILURES; i++) {
    assert.equal(loginAllowed("k", t0 + i).allowed, true);
    recordLoginFailure("k", t0 + i);
  }
  const gate = loginAllowed("k", t0 + 10);
  assert.equal(gate.allowed, false);
  assert.ok(gate.retryAfterSec > 0 && gate.retryAfterSec <= 900);
});

test("failures age out after 15 minutes", () => {
  for (let i = 0; i < MAX_FAILURES; i++) recordLoginFailure("k", 0);
  assert.equal(loginAllowed("k", 15 * 60_000 + 1).allowed, true);
});

test("keys are independent and success clears the counter", () => {
  for (let i = 0; i < MAX_FAILURES; i++) recordLoginFailure("a", 0);
  assert.equal(loginAllowed("b", 1).allowed, true);
  clearLoginFailures("a");
  assert.equal(loginAllowed("a", 1).allowed, true);
});
