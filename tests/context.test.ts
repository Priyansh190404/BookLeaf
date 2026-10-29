import assert from "node:assert/strict";
import { test } from "node:test";
import { describeBook } from "../src/lib/ai/context";
import type { BookRow } from "../src/lib/repositories/books";

const base: BookRow = {
  id: "BK005", author_id: "AUTH003", title: "Between Two Temples", isbn: "978", genre: "Historical Fiction",
  publication_date: "2024-07-05", status: "Published & Live", mrp: 425, author_royalty_per_copy: 38,
  total_copies_sold: 67, total_royalty_earned: 2546, royalty_paid: 0, royalty_pending: 2546,
  last_royalty_payout_date: null, print_partner: "Epitome Books", available_on: ["Amazon India"],
};
const today = new Date("2026-10-27T00:00:00Z");

test("never-paid published book is called out explicitly", () => {
  assert.match(describeBook(base, today), /never been paid out/);
});

test("pending below Rs 1,000 is flagged as rolling over", () => {
  assert.match(describeBook({ ...base, royalty_pending: 850 }, today), /BELOW the Rs 1,000 minimum/);
});

test("in-production book exposes no royalty/sales facts", () => {
  const out = describeBook({ ...base, status: "In Production - Cover Design", publication_date: null, mrp: null, author_royalty_per_copy: null, total_copies_sold: 0 }, today);
  assert.match(out, /NOT yet published/);
  assert.doesNotMatch(out, /Royalty earned/);
});
