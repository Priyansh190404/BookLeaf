import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeFilename, sniffMime } from "../src/lib/attachments";

const bytes = (...b: number[]) => Uint8Array.from([...b, ...new Array(16).fill(0)]);

test("sniffs real file types from magic bytes", () => {
  assert.equal(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), "image/png");
  assert.equal(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
  assert.equal(sniffMime(bytes(0x25, 0x50, 0x44, 0x46, 0x2d)), "application/pdf");
  assert.equal(sniffMime(bytes(0x47, 0x49, 0x46, 0x38, 0x39)), "image/gif");
  const webp = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
  assert.equal(sniffMime(webp), "image/webp");
});

test("rejects executables, scripts and html regardless of extension", () => {
  assert.equal(sniffMime(bytes(0x4d, 0x5a)), null);                       // Windows exe
  assert.equal(sniffMime(new TextEncoder().encode("<html><script>alert(1)</script>")), null);
  assert.equal(sniffMime(new Uint8Array(0)), null);
});

test("filenames: paths, control chars and quotes are stripped", () => {
  assert.equal(sanitizeFilename("../../etc/passwd"), "passwd");
  assert.equal(sanitizeFilename('C:\\temp\\bad"name<>.png'), "badname.png");
  assert.equal(sanitizeFilename("   "), "attachment");
  assert.ok(sanitizeFilename("x".repeat(500) + ".pdf").length <= 120);
});
