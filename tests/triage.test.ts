import assert from "node:assert/strict";
import { test } from "node:test";
import { fallbackTriage } from "../src/lib/ai/triage";

const t = (subject: string, description: string) => fallbackTriage({ subject, description });

test("royalty not received for months -> Royalty / Critical", () => {
  const r = t("No royalty", "I haven't received any royalty for 6 months");
  assert.equal(r.category, "Royalty & Payments");
  assert.equal(r.priority, "Critical");
  assert.equal(r.source, "fallback");
});

test("ISBN issues are at least High (company policy)", () => {
  const r = t("Wrong ISBN", "My book shows a different ISBN on Amazon than on the physical copy");
  assert.equal(r.category, "ISBN & Metadata Issues");
  assert.equal(r.priority, "High");
});

test("printing defects -> Printing & Quality / High", () => {
  const r = t("Bad copies", "Author copies have blurry images and misaligned pages, terrible quality");
  assert.equal(r.category, "Printing & Quality");
  assert.equal(r.priority, "High");
});

test("bio update -> General Inquiry / Low", () => {
  const r = t("Author bio", "Can I update my author bio?");
  assert.equal(r.category, "General Inquiry");
  assert.equal(r.priority, "Low");
});

test("unrecognised text still gets a valid category and priority", () => {
  const r = t("Hello", "Just wanted to say hi");
  assert.equal(r.category, "General Inquiry");
  assert.ok(["Critical", "High", "Medium", "Low"].includes(r.priority));
});

test("merely mentioning a platform is not a distribution issue", () => {
  const r = t("Update my author bio", "Can I update my author bio on Amazon? Thanks a lot.");
  assert.equal(r.category, "General Inquiry");
  assert.equal(r.priority, "Low");
});

test("'Currently Unavailable' on Amazon -> Distribution", () => {
  assert.equal(t("Not live", "My book shows Currently Unavailable on Amazon").category, "Distribution & Availability");
});
