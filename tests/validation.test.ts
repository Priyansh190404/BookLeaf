import assert from "node:assert/strict";
import { test } from "node:test";
import { createTicketSchema, loginSchema, updateTicketSchema } from "../src/lib/validation";

test("login normalises email", () => {
  assert.equal(loginSchema.parse({ email: "  A@B.com ", password: "x" }).email, "a@b.com");
});

test("ticket: General / Account Level = no bookId", () => {
  const r = createTicketSchema.parse({ subject: "Hello there", description: "x".repeat(25) });
  assert.equal(r.bookId, undefined);
});

test("ticket: rejects short description and long subject", () => {
  assert.equal(createTicketSchema.safeParse({ subject: "Hello there", description: "short" }).success, false);
  assert.equal(createTicketSchema.safeParse({ subject: "x".repeat(151), description: "x".repeat(25) }).success, false);
});

test("patch: rejects unknown enum values and empty bodies", () => {
  assert.equal(updateTicketSchema.safeParse({ status: "Done" }).success, false);
  assert.equal(updateTicketSchema.safeParse({}).success, false);
  assert.equal(updateTicketSchema.safeParse({ assignedTo: "me" }).success, true);
});
